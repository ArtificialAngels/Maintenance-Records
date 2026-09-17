# Maintenance-Records 开发计划

> 一个部署在 Windows Server 上的多人实时同步「智能表格」,用于多人上传图片 + 填报维修记录。
> 列结构由管理员动态配置,数据以 JSON + 文件方式存储,目录可整体迁移。

---

## 0. 已确认的技术与规模决策

| 维度 | 决策 | 理由 |
|---|---|---|
| 后端 | Node.js + TypeScript (Fastify) | 与前端同语言、TS 类型共享、生态最匹配 WS + 文件存储 |
| 前端 | React 18 + Vite + TypeScript | 动态列表格自己渲染即可,不依赖 ag-grid |
| 部署 | Windows Server (NSSM 服务化) | 长期常驻服务,NSSM 比 node-windows 更稳 |
| 规模 | < 20 人单团队 | 简单 WS + JSONL 追加写即可,不上 CRDT |
| 数据存储 | JSON 文件 + 文件系统图片目录 | 满足需求,目录可整体打包迁移 |
| 实时同步 | Socket.IO(事件分发,服务端写锁) | < 20 人足够,留升级到 CRDT 的口子 |
| 公式引擎 | `expr-eval` + 自定义函数(IF/DATEDIF/...),v1 不暴露 JS sandbox | 安全性优先;后续可加 `isolated-vm` 升级 |
| 认证 | JWT(账号密码本地 JSON 用户表) | 简单,留 hook 给 SSO |

---

## 1. 产品形态

```
┌─────────────────── 浏览器 (每个用户) ───────────────────┐
│  登录页 ──▶ 表格视图(动态列渲染,字段类型见 §4)            │
│           └ 个人视图配置:列宽/隐藏列/排序/密度 → localStorage │
│                                                        │
│  管理员 ─▶ Schema 编辑器(列拖拽、类型、可见性、权限)        │
│         └ 选项集管理(下拉框选项值)                          │
└────────────────────────┬───────────────────────────────┘
                WebSocket + REST
┌────────────────────────▼───────────────────────────────┐
│                Fastify 服务 (Windows Service)            │
│  ┌─ Auth ─ Row CRUD ─ Schema ─ Options ─ Formula ─ WS ─┐ │
│  └─ Storage 层:JSONL appender + 周期 snapshot ──────────┘ │
└────────────────────────┬───────────────────────────────┘
                         │ fs
┌────────────────────────▼───────────────────────────────┐
│  D:\MaintenanceData\   ← 由 MAINTENANCE_DATA_DIR 控制      │
│    ├ tables\<tableId>\…                                  │
│    ├ users.json                                         │
│    └ .admin-token (首次启动生成)                          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 数据与文件结构(可整体迁移)

存储根目录通过环境变量 `MAINTENANCE_DATA_DIR` 配置,部署在不同机器只需重设该变量 + 拷贝目录。

```
<DATA_DIR>/
├── users.json                          # 用户/角色表(admin / user)
├── .admin-token                        # 首次启动写出的初始管理员一次性 token
├── tables/
│   └── <tableId>/
│       ├── schema.json                 # 列结构(见 §4)+ 元信息
│       ├── meta.json                   # 当前 schema 版本、最后 rowId
│       ├── rows.jsonl                  # 行追加日志(append-only)
│       ├── snapshots/
│       │   └── snap-<ts>.json          # 周期快照(默认每 5 分钟或每 500 行)
│       └── images/
│           └── <rowId>/
│               └── <colId>/
│                   ├── <uuid>.jpg
│                   └── <uuid>.png
└── logs/
    └── audit.log                       # 关键操作审计(谁/何时/改了什么)
```

**为什么用 JSONL(rows.jsonl)?**
- 写操作 = 追加一行 JSON,天然原子,断电不丢。
- 启动时:加载最新 snapshot + replay 自 snapshot 起的 JSONL,内存里重建状态。
- 周期合并 snapshot,JSONL 滚动归档,降低启动延迟。

**迁移方式:**
- 冷迁移:停服 → 拷贝 `<DATA_DIR>` 整目录 → 新机器重设 `MAINTENANCE_DATA_DIR` → 起服。
- 热备份:CLI `npm run export -- --out backup-2026-09-17.zip`(打包 JSON + 图片,跨机器可还原)。
- 还原:`npm run import -- --in backup.zip`。

---

## 3. 表 / 列 / 行 数据模型

### 3.1 `schema.json`

```jsonc
{
  "tableId": "maintenance",
  "name": "维修记录",
  "schemaVersion": 5,
  "columns": [
    {
      "id": "report_date",
      "name": "报修日期",
      "type": "date",
      "required": true,
      "visible": true,
      "editableByRoles": ["admin", "user"]
    },
    {
      "id": "description",
      "name": "故障描述",
      "type": "text",
      "required": true,
      "visible": true,
      "editableByRoles": ["admin", "user"]
    },
    {
      "id": "photos",
      "name": "现场照片",
      "type": "image",
      "multiple": true,
      "maxCount": 5,
      "maxSizeMB": 10,
      "visible": true,
      "editableByRoles": ["admin", "user"]
    },
    {
      "id": "status",
      "name": "状态",
      "type": "option",
      "optionSetId": "status_v1",
      "visible": true,
      "editableByRoles": ["admin", "user"]
    },
    {
      "id": "cost",
      "name": "维修费用",
      "type": "number",
      "visible": true,
      "editableByRoles": ["admin"]
    },
    {
      "id": "due_date",
      "name": "预计完成日期",
      "type": "formula",
      "formula": "DATEADD({{report_date}}, 7, 'day')",
      "dependsOn": ["report_date"],
      "visible": true,
      "editableByRoles": []    // 公式列永远不可编辑
    }
  ],
  "optionSets": {
    "status_v1": ["待处理", "处理中", "已完成", "已取消"]
  }
}
```

字段类型枚举:`text | number | date | image | option | formula`。
公式列 `editableByRoles` 必须为空;写入时服务端忽略客户端传来的值,只重算。

### 3.2 行存储(`rows.jsonl` 一行一条)

```json
{"op":"insert","id":"row_<uuid>","ts":"...","by":"user1",
 "values":{"report_date":"2026-09-17","description":"...","status":"待处理"}}
{"op":"update","id":"row_<uuid>","ts":"...","by":"user2",
 "patch":{"status":"处理中"}}
{"op":"delete","id":"row_<uuid>","ts":"...","by":"admin"}
```

`op` 简化版本控制;replay 时按 op 应用,失败回退到上一个 snapshot。

---

## 4. 实时同步设计

- 每个客户端登录后与服务器建 WS,`subscribe(tableId)` 加入房间。
- 服务端写操作流程:
  1. 鉴权 + 字段可见性/可编辑性校验。
  2. 获取**该 table 的写锁**(进程内 mutex,< 20 人足够)。
  3. 写 `rows.jsonl`(fsync)。
  4. 若为 formula 列的依赖列变更,重算公式值并合并到行 patch,再追加一条 update。
  5. 释放锁 → 通过 WS 广播 `row.upserted` / `row.deleted` / `schema.updated`。
- 客户端断线重连:服务端推「snapshot reference」(最新 snapshot 文件名 + 之后的 JSONL offset),客户端 GET 拉取增量,完整重建本地行。
- 冲突策略:last-writer-wins 字段级(写锁保证顺序);若以后扩到 100+ 人,再换 CRDT。

---

## 5. 权限模型

两类角色,字段粒度控制:

| 角色 | Schema 编辑 | 选项集编辑 | 行读取 | 行写入 |
|---|---|---|---|---|
| `admin` | ✅ | ✅ | 全列 | 全列(除公式列) |
| `user` | ❌ | ❌ | 仅 `visible:true` 的列 | 仅 `editableByRoles` 包含 `user` 的列 |

- API 层在 Row CRUD 中以 zod + 角色 + 列白名单三重校验,前端 `visible:false` 列不下发。
- 图片 URL 为临时签名链接(短 TTL),避免外链泄漏。

---

## 6. 公式引擎(v1 方案)

- 表达式文本:`expr-eval` 解析,变量名用 `{{col_id}}` 占位,运行前替换为行内值。
- 内置函数:`IF / AND / OR / NOT / TODAY / NOW / DATEADD / DATEDIF / ROUND / CONCAT / COALESCE`。
- 字段必须声明 `dependsOn`,写入时按依赖图重算。
- 安全:不放任何 `eval` / `Function`;所有输入走 zod 校验。
- v2 升级路径(留接口):若用户要求「写 JS」,改为 `isolated-vm` 沙箱,字段类型变 `formula_js`,API 兼容。

---

## 7. API 概览

### REST
| Method | Path | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/auth/login` | 账号密码 → JWT | 公开 |
| GET  | `/api/me` | 当前用户信息 | 登录 |
| GET  | `/api/tables` | 表列表 | 登录 |
| POST | `/api/tables` | 建表 | admin |
| GET  | `/api/tables/:id` | schema | 登录 |
| PATCH| `/api/tables/:id/schema` | 改 schema | admin |
| GET  | `/api/tables/:id/option-sets` | 选项集 | 登录 |
| PATCH| `/api/tables/:id/option-sets/:key` | 改选项 | admin |
| GET  | `/api/tables/:id/rows?since=<snapshotId>&offset=<n>` | 拉行 | 登录 |
| POST | `/api/tables/:id/rows` | 增行 | 视列权限 |
| PATCH| `/api/tables/:id/rows/:rowId` | 改行 | 视列权限 |
| DELETE| `/api/tables/:id/rows/:rowId` | 删行 | admin |
| POST | `/api/tables/:id/uploads` | 图片上传(multipart) | 视列权限 |
| GET  | `/api/tables/:id/assets/:assetId?sig=...` | 取图片(签名) | 登录 |

### WebSocket 事件
| 方向 | 事件 | Payload |
|---|---|---|
| C→S | `subscribe` | `{ tableId }` |
| S→C | `schema.updated` | 完整 schema |
| S→C | `row.upserted` | `{ row }` |
| S→C | `row.deleted` | `{ rowId }` |
| S→C | `presence` | `{ userId, lastSeen }` |

---

## 8. 代码组织(Monorepo + pnpm workspaces)

```
Maintenance-Records/
├── apps/
│   ├── server/                 # Fastify
│   │   ├── src/
│   │   │   ├── index.ts        # 入口,NSSM 直接调用 dist/index.js
│   │   │   ├── config.ts       # 读 MAINTENANCE_DATA_DIR 等
│   │   │   ├── auth/           # JWT、密码 hash、登录
│   │   │   ├── tables/         # 表 & schema 路由
│   │   │   ├── rows/           # 行 CRUD + JSONL appender
│   │   │   ├── images/         # multipart 上传 + 签名下载
│   │   │   ├── options/        # 选项集
│   │   │   ├── formulas/       # 表达式解析、重算
│   │   │   ├── storage/        # snapshot 周期合并
│   │   │   └── ws/             # Socket.IO 房间/事件分发
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                    # React + Vite
│       ├── src/
│       │   ├── pages/{Login,TableView,SchemaEditor,OptionsAdmin}.tsx
│       │   ├── components/{Grid,Cell*,ImageUpload,FormulaEditor}.tsx
│       │   ├── stores/{authStore,tableStore}.ts
│       │   ├── hooks/{useSocket,useSchema}.ts
│       │   ├── lib/{api.ts,formulaPreview.ts}
│       │   └── main.tsx
│       └── package.json
├── deploy/
│   ├── install-service.ps1     # NSSM 安装脚本
│   ├── uninstall-service.ps1
│   ├── backup.ps1              # robocopy + 7z 打包
│   └── README.md
├── docs/
│   └── plan.md                 # 本文件
├── data/                       # 默认数据根(开发用,.gitignore)
├── .env.example
├── pnpm-workspace.yaml
├── package.json                # 根 scripts:dev/build/start/backup
└── README.md
```

---

## 9. 关键依赖

**Server:** `fastify`, `@fastify/jwt`, `@fastify/multipart`, `@fastify/static`, `@fastify/cors`, `socket.io`, `zod`, `bcryptjs`, `expr-eval`, `pino`(日志), `nanoid`。

**Web:** `react`, `react-dom`, `vite`, `typescript`, `@tanstack/react-query`, `zustand`, `socket.io-client`, `react-hook-form`, `zod`, `dayjs`, `react-router-dom`。

**Dev:** `pnpm`, `tsx`, `eslint`, `prettier`, `@types/*`。

---

## 10. 里程碑(单人约 3–4 周)

| 阶段 | 内容 | 交付 | 估时 |
|---|---|---|---|
| **P0 基础工程** | monorepo、Vite + Fastify 跑通 `/health`、ESLint/Prettier | `pnpm dev` 可启动 | 2–3 天 |
| **P1 存储层** | JSONL appender + snapshot + rows/schema/option 落盘 | 单元测试覆盖 append/replay | 3–4 天 |
| **P2 认证 + 权限** | users.json + JWT + 角色中间件 + 列白名单校验 | 登录、admin 引导 token | 2 天 |
| **P3 行 CRUD + 图片** | REST 全套 + multipart 上传 + 签名下载 | curl 走通增删改查 + 上传 | 3–4 天 |
| **P4 实时同步** | Socket.IO 房间 + 事件分发 + 断线重连补量 | 两个浏览器协同编辑可见 | 2–3 天 |
| **P5 公式引擎** | expr-eval + 内置函数 + 依赖图重算 | 示例:日期+7 天、相加 | 2–3 天 |
| **P6 前端页面** | 登录/表格/Schema 编辑/选项集 + localStorage 个人视图 | 浏览器可走通主流程 | 5–7 天 |
| **P7 迁移工具 + 部署** | `export`/`import` CLI、NSSM 安装脚本、备份脚本 | 在第二台机器恢复演练通过 | 2 天 |
| **P8 硬化** | 速率限制、上传大小/类型、审计日志、错误处理、备份演练 | 上线就绪 | 2–3 天 |

---

## 11. Windows Server 部署方案

### 11.1 安装路径(建议)
- 应用代码:`C:\apps\Maintenance-Records\`(`pnpm build` 产物)
- 数据目录:`D:\MaintenanceData\`(与系统盘分离,便于备份与迁移)
- 服务名:`MaintenanceRecords`
- 端口:默认 `127.0.0.1:8787`,前置 IIS 反代到 `443` 出 HTTPS(可选)

### 11.2 安装步骤(脚本化)
1. 安装 Node.js LTS(20.x)与 NSSM。
2. 解压应用 → `C:\apps\Maintenance-Records\`。
3. 在 `D:\MaintenanceData\` 创建空目录(从开发机导出初始 `users.json`)。
4. 创建 `.env`:
   ```
   MAINTENANCE_DATA_DIR=D:\MaintenanceData
   JWT_SECRET=<随机 64 字节>
   PORT=8787
   PUBLIC_BASE_URL=https://records.example.local
   ```
5. `pnpm install --frozen-lockfile && pnpm build`
6. `deploy\install-service.ps1`(调用 NSSM):
   ```
   nssm install MaintenanceRecords "C:\Program Files\nodejs\node.exe" "C:\apps\Maintenance-Records\apps\server\dist\index.js"
   nssm set MaintenanceRecords AppDirectory "C:\apps\Maintenance-Records"
   nssm set MaintenanceRecords AppEnvironmentExtra MAINTENANCE_DATA_DIR=D:\MaintenanceData
   nssm set MaintenanceRecords DisplayName "Maintenance Records"
   nssm set MaintenanceRecords Start SERVICE_AUTO_START
   nssm start MaintenanceRecords
   ```
7. 首次访问 `/api/bootstrap/admin-token` 读取一次性 token 绑定管理员账号。

### 11.3 备份与还原
- 每日 02:00 计划任务执行 `deploy\backup.ps1`:`robocopy` 拷贝 `D:\MaintenanceData` 到 `\\backup\MaintenanceRecords\<日期>\`,另打 7z 包到 NAS。
- 还原演练文档化在 `deploy\README.md`(每季度人工抽测一次)。

---

## 12. 个人视图配置(浏览器本地)

写入 `localStorage` 键 `mr:view:<tableId>`,结构:
```json
{
  "columnWidths": { "photos": 240, "description": 320 },
  "hiddenColumns": ["cost"],
  "sort": { "report_date": "desc" },
  "density": "compact",
  "filters": [{ "col": "status", "op": "in", "value": ["待处理", "处理中"] }]
}
```
- 每次用户登录后合并云端 schema,差异列(localStorage 引用了已删除列)静默清理。
- 不上传服务器,跨设备不共享;这点符合需求里「保存在每个人的浏览器缓存」。

---

## 13. 安全 & 可靠性

- 密码:`bcryptjs` cost 12;初始 admin 走一次性 token 绑定,杜绝弱口令默认。
- JWT:HS256 + 服务端 secret,HttpOnly Cookie + SameSite=Lax(避免 localStorage 暴露给 XSS)。
- 上传:限制 MIME(仅 `image/jpeg|png|webp|heic`)、单文件 ≤10MB、单行 ≤50MB;用 `@fastify/multipart` 的 `limits`。
- 速率限制:`@fastify/rate-limit`,登录端点单独更严。
- 审计日志:写 `logs/audit.log`(schema 变更、行删除、登录失败、admin 操作)。
- 错误边界:前端 React ErrorBoundary + 全局 toast;服务端统一错误格式 `{ code, message, details? }`。

---

## 14. 待你后续确认的小决策(不阻塞开发,默认已按推荐走)

| 项 | 默认 | 可选 |
|---|---|---|
| 前端框架 React vs Vue | React | Vue 3 同样 OK |
| 端口 | `8787` | 任意空闲 |
| HTTPS | 走 IIS/反向代理 | 直接 Node `https` 自签 |
| 公式 v2 是否要 JS 沙箱 | v1 不上 | 上 `isolated-vm` |
| 是否要行版本历史/时光机 | 不上(留接口) | 二期追加 |
| 是否要导出 Excel | 不上(留接口) | `exceljs` |
| 数据库 vs 纯 JSON | 纯 JSON(满足需求) | SQLite 仅存用户/审计 |

---

## 15. 立即可启动的 3 步

1. 在仓库根执行 `pnpm init` 改为 monorepo + 创建 `apps/server`、`apps/web`。
2. 写 `apps/server/src/index.ts` 一个最小 Fastify + `/health`。
3. 写 `apps/web` Vite 最小 React 页面 + 联调 `/health`。

之后按 P1→P8 顺序推进,每个阶段结束跑通 `pnpm test`(vitest)再进入下一阶段。