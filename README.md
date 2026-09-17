# Maintenance Records (Demo v2)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Node ≥20](https://img.shields.io/badge/node-%E2%89%A520-339933.svg)](https://nodejs.org)
[![pnpm 9](https://img.shields.io/badge/pnpm-9-F69220.svg)](https://pnpm.io)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF.svg)](./.github/workflows/ci.yml)

多人实时同步的「智能表格」演示 — **已根据真实业务 Excel 重新设计 schema 和字段**。

> ⚠️ 这是 **功能演示 (vertical slice)**,不是最终生产版本。
> 开发计划与架构决策见 [docs/plan.md](docs/plan.md)。

---

## v2 改进(基于实际业务文件)

根据你提供的两份 Excel (`计划外维修汇总登记表.xlsx` + `2026修模统计(程序完成).xlsx`):

1. ✅ **三张独立表**(不是合并的):
   - `计划外制作清单`(unplanned)— 22 列 × 11 工时 + 三图
   - `设备备件`(equipment)— 19 列 × 11 工时 + 三图
   - `工装夹具`(mold_install)— 19 列 × 11 工时 + 成本中心号 + 三图
2. ✅ **每行三列图片**:`修复前` / `修复认可` / `修复后`
3. ✅ **图片预览修复**:`<img>` 不带 Authorization header 的问题已修(改用 assetId 作为隐式密钥)
4. ✅ **统计聚合页** `/tables/:id/stats`:按单位/紧急程度/产品/类型/报修内容/周/月 7 个维度的计数 + 工时合计
5. ✅ **Excel 导入 CLI** `pnpm import-xlsx -- --file <path>`:把你的旧 Excel 数据灌进 demo
6. ✅ **真实字典**全部从你的 Setting 表导入(7 单位 / 8 类型 / 3 报修 / 3 紧急 / 97 产品 / 5 设备类型)

---

## 功能覆盖(演示级)

| # | 能力 | 验证 |
|---|---|---|
| 1 | 登录(用户选择器) | ✅ |
| 2 | 6 种字段类型:text / number / date / option / image / formula | ✅ |
| 3 | 11 工时列 × 3 表,公式 `SUMARGS(...)` 自动合计 | ✅ |
| 4 | 公式列:工时合计、周(WEEKNUM)、月(MONTH) | ✅ |
| 5 | 3 列图片上传(修复前/认可/后)+ 点击放大 | ✅ |
| 6 | Schema 编辑器(列增删/类型/可见性/权限) | ✅ |
| 7 | 选项集管理(7 个字典) | ✅ |
| 8 | 实时同步(Socket.IO 多窗口) | ✅ |
| 9 | 权限:admin 全权 / user 仅可见可编辑列 | ✅ |
| 10 | 个人视图(localStorage 列宽/隐藏/排序) | ✅ |
| 11 | 审计日志(admin 完整 / user 只看自己的) | ✅ |
| 12 | 统计聚合(7 维度 + 总工时 + 总行数) | ✅ |
| 13 | Excel 导入 CLI(自动按表头名映射) | ✅ |
| 14 | 数据导出/导入(整体迁移) | ✅ |

---

## 一键启动

```powershell
pnpm install
pnpm seed                    # 初始化 3 张表(用你的真实字典)
pnpm import-xlsx -- `
  --file "D:\path\to\计划外维修汇总登记表.xlsx"   # 把旧 Excel 数据灌进 demo
pnpm dev                     # 同时拉起 server(8787) + web(5173)
```

浏览器打开 **http://localhost:5173**:
1. **管理员**登录,看到 3 张表(计划外制作清单 / 设备备件 / 工装夹具)
2. 进任一表,顶部有「**列配置**」「**选项集**」「**📊 统计**」
3. 试一下公式:改任一行的「打磨」/「三轴CNC」等工时,「工时合计」列实时重算
4. 上传几张照片到「修复前/认可/后」三列 → 点击缩略图放大
5. 进「📊 统计」,看按单位/产品/类型/周/月 7 个维度的柱状聚合
6. 退出,用 Alice 或 Bob 登录(普通用户),验证列可见性 + 行可编辑性

---

## 字段映射(Excel → Demo 表)

| Excel 真实表头 | 我们的字段 id | 类型 |
|---|---|---|
| 序号 | serial_no | text |
| 部门 | department | option(units) |
| 起始时间 | start_date | date |
| 产品 / 产品名称 | product / product_name | option(products) |
| 部件 / 类别 / 编号 | part / category / drawing_no | text/option |
| 制作类型 | product_type | option(repair_contents) |
| 紧急程度 | urgency | option(urgencies) |
| 打磨/拆模/烧焊/装夹/深孔/三轴CNC/五轴CNC/电火花/线切割/钳工/检验 | hours_polish/dismantle/weld/clamp/... | number |
| 备注 | notes | text |
| 完工日期 | complete_date | date |
| 工艺员/填报员 | reporter | text |
| 成本中心号(仅 工装夹具) | cost_center | text |
| 修复前 / 修复认可 / 修复后 | photo_before/approval/after | image (multiple) |

---

## 目录结构

```
Maintenance-Records/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── auth/        登录 + JWT
│   │   │   ├── tables/      Schema/Options CRUD
│   │   │   ├── rows/        行 CRUD + 公式重算
│   │   │   ├── images/      multipart 上传 + 静态下载
│   │   │   ├── options/     选项集
│   │   │   ├── formulas/    expr-eval + WEEKNUM/MONTH
│   │   │   ├── stats/       聚合 API
│   │   │   ├── audit/       审计 JSONL
│   │   │   ├── ws/          Socket.IO
│   │   │   ├── storage/     JSON + mutex
│   │   │   ├── cli/         seed / export / import / import-xlsx
│   │   │   └── permissions/
│   │   └── data/            运行时数据(默认 <repo>/apps/server/data)
│   └── web/
│       ├── src/
│       │   ├── pages/       Login / TablesList / Table / SchemaEditor / Options / Stats / Audit
│       │   ├── components/  CellEditor / ImagePreview(+Gallery)
│       │   ├── stores/      authStore / viewStore(localStorage)
│       │   └── lib/         api / socket / types
│       └── dist/
├── docs/plan.md
├── .extract_*.py             一次性数据提取脚本(隐藏)
└── README.md
```

---

## 关键技术决定

- **公式引擎**: expr-eval + 自定义函数(SUMARGS / WEEKNUM / MONTH / IF 等)
- **图片鉴权**: assetId 12 字符 nanoid(64 位熵)当隐式密钥,asset GET 公开(私有内部工具)
- **存储**: JSON 文件 + 进程内 mutex;每行都实时重算公式
- **导入**: SheetJS (xlsx) + 按 Excel 表头名匹配目标字段
- **实时同步**: Socket.IO 房间订阅 + WS 广播 row.* / schema.updated
- **个人视图**: localStorage `mr:view:<tableId>` 存列宽/隐藏/排序

---

## 下一步(进入正式开发)

详见 [docs/plan.md §10 里程碑](docs/plan.md)。演示通过后,从 P1(JSONL 生产级存储层)开始按里程碑推进。