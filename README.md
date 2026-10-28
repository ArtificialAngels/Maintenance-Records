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
| 1 | 登录(账号 + 密码,scrypt 校验,失败限流) | ✅ |
| 2 | 6 种字段类型:text / number / date / option / image / formula | ✅ |
| 3 | 11 工时列 × 3 表,公式 `SUMARGS(...)` 自动合计 | ✅ |
| 4 | 公式列:工时合计、周(WEEKNUM)、月(MONTH) | ✅ |
| 5 | 3 列图片上传(修复前/认可/后)+ 点击放大 | ✅ |
| 6 | Schema 编辑器(列增删/类型/可见性/权限) | ✅ |
| 7 | 选项集管理(7 个字典) | ✅ |
| 8 | 实时同步(Socket.IO 多窗口) | ✅ |
| 9 | 权限:admin 全权 / user 按账号分配表格的「只读 / 可编辑」 | ✅ |
| 10 | 用户管理:新增 / 删除账号,按表格分配权限,自己改密码 | ✅ |
| 11 | 个人视图(localStorage 列宽/隐藏/排序) | ✅ |
| 12 | 审计日志(admin 完整 / user 只看自己的) | ✅ |
| 13 | 统计聚合(7 维度 + 总工时 + 总行数) | ✅ |
| 14 | Excel 导入 CLI(自动按表头名映射) | ✅ |
| 15 | 数据导出/导入(整体迁移) | ✅ |
| 16 | 表格页 Excel 导出/导入(导出不含图片列,导入按表头追加) | ✅ |
| 17 | 表格分页:每页最多 50 条,默认最新在前;排序、翻页都在服务端做 | ✅ |

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
6. 退出,用 Alice / Bob 账号登录(默认密码 `alice123` / `bob123`),验证列可见性 + 行可编辑性

---

## 开发环境准备

生产部署不需要装 Node（发布包自带便携运行时）；只有**开发 / 构建**才需要在本机准备环境：

```powershell
pwsh scripts/setup-runtime.ps1   # 可选：下载便携 Node v24.22.1 + pnpm 9.12.0 到 node-runtime\（约 140MB，不入库）
pnpm install                     # 安装依赖（有便携 pnpm 时优先用它）
pnpm seed                        # 首次初始化 3 张表（真实字典）
pnpm dev                         # 同时拉起 server(8787) + web(5173，热更新)
```

说明：

- 构建/启动脚本优先使用 `node-runtime\win-x64\node.exe`；便携运行时缺失时自动回退到系统 Node（需 ≥20）。
- `node-runtime\` 已在 `.gitignore`，每台机器执行一次 `setup-runtime.ps1` 即可；重复运行会跳过已下载文件（`-Force` 强制重下）。
- 开发模式日志直接打印在 `pnpm dev` 的控制台；生产模式日志在 `.run\logs\prod.*.log`。
- 根目录只保留与发布版一致的 5 个 bat（启动服务 / 停止服务 / 设置密码 / 开放防火墙 / 诊断），开发一律走 pnpm 命令，不再提供开发用的双击启动器。

---

## 服务器部署（内网生产，单进程直出）

生产形态为**单个 Fastify 进程**同时托管前端页面、API 与 WebSocket：前端 `vite build` 产物由 `@fastify/static` 同源直出，用户只需一个内网链接，不需要在各自电脑装 Node。

### 方式 A：手动启动（先验证）

1. 把整个目录拷到服务器（含 `node-runtime\` 可离线运行），确认已执行过 `pnpm install` 并构建过（`pnpm build`）。
2. 双击 **启动服务.bat**：自动构建前后端，再以隐藏后台进程启动（默认 **8080** 端口，**不需要管理员权限**，也**不会去占用 80**；需要换端口就传参 `启动服务.bat 8090`）。若 PowerShell 被策略禁用，会自动改用不依赖 PowerShell 的启动方式。
3. 浏览器访问 `http://服务器IP:8080/`（换过端口就改成对应端口）。
4. **停止服务.bat** 停止后台进程；日志在 `.run\logs\prod.*.log`。

> 本仓库不再提供注册 Windows 服务（NSSM）的脚本：内网部署统一用「发布包 + 双击启动服务.bat」，或由 IT 用计划任务在开机时调用 `scripts\start-prod.ps1`。

### 账号与密码

- 首次生成 `users.json` 时带默认账号：`u_admin / admin123`（管理员）、`u_alice / alice123`、`u_bob / bob123`，**登录后应立即修改**。
- **用户管理页**（管理员登录后左侧「用户管理」）：
  - **新增用户**：填账号（2–32 位，字母/数字/下划线/点/横线）、姓名、角色（管理员/录入员）、初始密码，并当场勾选能访问哪些表格。
  - **删除用户**：不能删自己；删除后该账号立即无法登录，历史记录和审计日志保留。
  - **表格权限**：每个录入员对每张表可设「无权限 / 只读 / 可编辑」。只读表里看不到「新建行」、单元格不可编辑、行删除按钮隐藏；服务端同样会拒绝写入（不是只靠前端隐藏）。保存后**立即生效**，对方刷新页面即可，无需重新登录。
  - **改密码**：录入员忘记密码 → 管理员点该行的「重置密码」直接设置；**自己的密码** → 点自己那行的「修改我的密码」（需要输入当前密码）。管理员之间不能互相重置（安全限制），点了会给出说明。
- **设置密码.bat**（服务器上）：输入账号 ID 后按提示输入新密码（至少 6 位，不回显）。
- 密码使用 scrypt + 随机盐哈希存储，连续 5 次失败锁定 15 分钟。
- 开发目录未构建时 `设置密码.bat` 会自动回退 pnpm + tsx，发布包/已构建目录直接用便携 node 运行编译好的 CLI。
- 若改密码时提示「保存 users.json 失败」，说明数据目录写不进去（共享盘只读、文件被杀软/Excel 占用），页面会显示具体原因。
- JWT 密钥首次启动时自动生成并保存在 `.run\jwt.secret`（已在 `.gitignore`，勿随目录外发）。

> 权限模型细节：管理员永远拥有全部表格；`users.json` 里 `tablePermissions` **缺失**表示「升级前的旧账号」——保持原来的全表可编辑行为，不会因为升级突然失去访问；`{}` 表示明确不给任何表。管理员在页面上保存一次权限后，该账号就变成明确的逐表权限。

> 列级权限仍然独立生效：表格权限决定「能不能进这张表、能不能写」，列上的「可编辑角色」决定「这一列能不能改」。图片资源按随机 assetId 提供（`<img>` 无法带 Authorization 头），拿到完整链接的人可以看图片；表格数据本身仍受接口鉴权保护。

### 内网 DNS（找 IT 操作）

1. 服务器固定内网 IP；在 DNS 控制台加一条 **A 记录**，如 `维修记录.公司域名` → 服务器 IP（或直接用服务器主机名，加域机器通常可直接解析）。
2. 确认服务器防火墙放行对应 TCP 端口（双击 `开放防火墙.bat` 会自动添加）。
3. 之后用户在浏览器只输 `http://维修记录.公司域名/` 即可。

### 数据与备份

- 全部数据（含图片）在 `apps\server\data\`：每天备份这个目录即可（可用 Windows 计划任务做 robocopy/卷影副本）。
- 数据目录可用环境变量 `MAINTENANCE_DATA_DIR` 改到数据盘；监听地址/端口用 `HOST` / `PORT`（服务脚本默认 `0.0.0.0:8080`，不使用 80）。
- 规模参考：JSON 文件单机存储适合几十人以内、万级行以内；更大规模需换数据库。

---

## 发布包与瘦身（生产推荐形态）

开发仓库的 `node_modules\` 约 **149 MB**，其中绝大部分是构建期工具（typescript 22.5 MB、vite/esbuild/rollup/babel 约 39 MB、prettier 9.5 MB、eslint ≈ 6 MB、@types 3 MB、tsx/concurrently 等），生产运行时根本用不到。生产部署一律使用发布包：

```powershell
pwsh scripts/make-release.ps1          # 或项目根目录运行 pnpm release
```

- 产物默认在仓库同级目录 `..\Maintenance-Records-release\`（可用 `-Out` 指定；重新生成会**保留**其中已有的 `apps\server\data`）。
- 产物构成（总计约 **95 MB**，其中便携 node.exe 就占 94 MB）：
  - `apps\server\dist\index.cjs` —— **单文件服务端 bundle（约 4.7 MB）**，运行时依赖（fastify / socket.io / xlsx / zod… 原本约 40 MB）已全部内联
  - `apps\server\dist\cli\set-password.cjs` —— 改密码 CLI 的 bundle（约 140 KB）
  - `apps\web\dist\` 构建好的前端（由 server 同源直出）
  - `node-runtime\win-x64\node.exe` 便携运行时（不含 pnpm.exe）
  - `scripts\{start-prod,stop-prod}.ps1，uncroot.cmd，serve-direct.cmd` + `启动服务.bat / 停止服务.bat / 设置密码.bat / 诊断.bat / 开放防火墙.bat`
- **发布包不再携带 `node_modules\`**：服务端用 esbuild 打成单个 CJS 文件（`--bundle --platform=node --format=cjs`）。好处有三点：体积从 40 MB 降到 4.7 MB；不会再有 pnpm 软链在共享盘上失联；拷贝/覆盖文件数从 4000+ 降到几十个。
- 发布包**不含任何构建能力**（无 vite/tsc/tsx），不能在发布包里重新构建；改代码后需开发仓库重新构建 + 重新生成发布包。改密码用 `设置密码.bat`。
- `-NoBundle` 开关：只拷贝 tsc 产物（`dist\index.js`），用于排查「是不是 bundle 引入的问题」；注意该模式**不**附带 `node_modules`，因此只能在开发仓库里跑，不能直接当发布包用。

### 为什么是 CJS 而不是 ESM

esbuild 打成 ESM 时，fastify 依赖链里的 CJS 包会生成 `require("node:events")`，在 ESM 里直接抛 `Dynamic require of "node:events" is not supported`。改成 `--format=cjs`（输出 `index.cjs`）后所有 `require` 都是原生的，实测启动/登录/取表/Excel 导入导出全部正常；`--external:bufferutil --external:utf-8-validate` 是 `ws` 的两个可选原生加速模块，缺失时自动降级。

### 还能再瘦吗

| 目标 | 现状 | 可选手段 | 代价 |
|---|---|---|---|
| `xlsx` | 打包后仍占 ~2.4 MB（含 `codepage` 的 GBK 码表） | 换 `exceljs`/手写 OOXML | 失去 `.xls`（BIFF8）中文支持；导出/导入代码要重写 |
| `socket.io` | ~1.3 MB | 换原生 `ws` + 自己写重连/房间逻辑 | 前端 `socket.io-client` 也要改 |
| `zod` | ~3.4 MB 源码（打包后裁剪后约 0.5 MB） | 手写校验 | 接口校验错误信息会退化 |
| `node.exe` | **94 MB，绝对大头** | 用 `node --experimental-sea-config` 做单文件 exe；或换轻量运行时 | SEA 需要代码签名/杀软白名单，首次构建成本高 |

结论：**剩余 90% 的体积是 Node 运行时本身，继续裁依赖的收益已经很小**（4.7 MB → 最多 3 MB）。要显著变小只能换运行时，收益/风险不划算。

## 共享盘部署（UNC 路径）

Node 的 ESM 加载器无法从 `\\服务器\共享\...` 这样的 UNC 路径启动（报 ERR_INVALID_FILE_URL_PATH），另外 cmd 也不支持把 UNC 路径当作当前目录。本项目已内置处理，无需手工映射：**启动服务.bat / 停止服务.bat / 设置密码.bat / 诊断.bat / 开放防火墙.bat 开头都会执行 `scripts\uncroot.cmd`**——发现 UNC 路径时自动把 `\\服务器\共享` 映射到一个空闲盘符（等同 `pushd` 的机制，优先复用已存在的映射），然后把项目根目录解析为盘符路径再启动，对使用者完全无感。

### 步骤（推荐：发布包）

1. 在开发仓库运行 `pnpm release` 生成发布包（构建产物 + 瘦身运行时）。
2. 把整个 `Maintenance-Records-release\` 目录拷到共享盘。
3. 双击共享盘里的 **启动服务.bat**（默认 **8080**，不需要管理员，也不占用 80；换端口就写 `启动服务.bat 8090`；首次启动自动开浏览器）。
4. 同事浏览器访问 `http://<共享盘服务器IP>:8080/`，数据集中保存在共享盘的 `apps\server\data\`。**同事打不开就双击 `开放防火墙.bat`**（放行端口，需要一次 UAC）。
5. 停止：共享盘里的 **停止服务.bat**。

### 只更新程序（热更新，不重拷 100 MB）

改了代码后重新生成发布包是 100 MB（其中 94 MB 是 node.exe）。只想更新程序时用热更新包（约 5 MB）：

1. 开发仓库 `pnpm release` 后，`D:\Github\Maintenance-Records-hotfix\` 就是热更新包（`scripts\make-hotfix.ps1` 生成：服务端 bundle + 前端 dist + 启动脚本 + `应用热更新.bat`）。
2. 把整个 hotfix 文件夹复制到发布包目录里（和 `启动服务.bat` 同级），双击里面的 **应用热更新.bat**；也可以直接双击，按提示粘贴发布包路径。
3. 脚本会自动：停止服务 → 覆盖 `apps\server\dist\index.cjs`、`apps\web\dist\`、`scripts\` → 重新启动服务。**不会动 `apps\server\data\`**（维修记录、图片、账号都保留）。
4. 同事浏览器按一次 **Ctrl+F5** 强制刷新。

注意：热更新只是替换文件，Node 进程必须重启才生效（脚本已自动做），没有真正意义上的「不重启热替换」。

### 步骤（备选：完整开发目录）

若直接把**开发目录**拷上共享盘运行，务必包含：`node-runtime\`、`node_modules\`（依赖安装时已用 `node-linker=hoisted` 平铺复制，拷贝到共享盘不会失联）、`apps\web\dist\` 与 `apps\server\dist\`（dist 在 `.gitignore` 里，必须随目录拷贝）。体积约是发布包的 2.5 倍以上，除此之外功能等价。

### 注意事项

- 共享盘上不建议触发生成构建（`启动服务.bat` 检测到缺 dist 时会自动构建，网盘上千次文件访问非常慢），请按上面步骤用发布包。
- 共享盘只跑生产服务：开发模式（`pnpm dev`，tsx watch + vite）受网络盘 IO 影响，且多台电脑同时从同一份拷贝开发会互相覆盖 `node_modules\.vite` 缓存——**开发请在本地目录进行**。
- 需要开机自启时，用 Windows 计划任务调用 `scripts\start-prod.ps1`（共享盘路径请先用 `scripts\uncroot.cmd` 映射为盘符）。
- `net use` 自动映射的盘符标注为非持久（`/persistent:no`），注销后自动失效，重启后再启动会重新映射，无需人工处理。

---

## 权限需求（哪些操作要管理员，哪些不要）

| 操作 | 需要管理员？ | 说明 |
|---|---|---|
| 双击 **启动服务.bat** 运行系统 | **不需要** | 默认监听 8080（高位端口），标准用户即可；系统只读写自己目录下的 `.run\` 与 `apps\server\data\` |
| 局域网其它电脑访问 | **一次性需要**（加防火墙规则） | Windows 防火墙默认拦截入站；双击 **开放防火墙.bat** 会自动请求一次 UAC 提权并放行端口（默认 8080，也可 `开放防火墙.bat 8090`）。没有管理员权限时脚本会把一行 `netsh` 命令打出来，发给 IT 执行一次即可 |
| **设置密码.bat** | **不需要** | 只改 `apps\server\data\users.json` |
| 把发布包放到 `C:\Program Files` | 不建议 | 该目录普通用户不可写，会导到 `.run`/数据写不进去；放 `D:\` 或用户目录即可 |

---

## 启动失败排查（公司电脑 / 受限环境）

现象对照：**双击后窗口一闪就没了、也没有生成 `.run\` 目录**。`.run\logs\` 是启动脚本的第一件事，连目录都没创建，说明失败发生在 Node 启动之前，绝大多数是下面几类原因：

1. **8080 端口被别的程序占用**（少见，但公司电脑上任何端口都可能被占）。启动时会直接提示「端口已被其它程序占用」，不会先失败再重试。
   → 换一个端口即可：`启动服务.bat 8090`，然后访问 `http://服务器IP:8090/`（防火墙规则也要跟着换：`开放防火墙.bat 8090`）。
   注：本系统**默认不使用 80 端口**，所以公司电脑上 80 被 IIS / `http.sys` / 公司 Web 系统占用与本系统无关，不影响使用。
2. **PowerShell 被组策略/杀软限制**（企业电脑常见）。启动脚本是 `.ps1`，如果 `-ExecutionPolicy Bypass` 也无效，会执行失败。
   → 启动脚本会**自动回退**到不依赖 PowerShell 的方式（`scripts\serve-direct.cmd`，直接用 cmd + node 拉起服务并写日志）；也可强制：`set MR_DIRECT=1` 后运行本文件。
3. 目录不可写（放在 `C:\` 根目录、`C:\Program Files`、只读共享、杀软防护目录）→ 把发布包放到 `D:\` 或用户目录（如 `D:\维修记录\`）。
4. 32 位系统：发布包只带 `node-runtime\win-x64\node.exe`，32 位 Windows 无法运行（诊断报告会打印处理器架构）。

启动成功后窗口会直接打印两个地址：

```
本机访问: http://127.0.0.1:8080/
同事访问: http://172.16.x.x:8080/   (需防火墙放行 TCP 8080，见「开放防火墙.bat」)
```

**本机能打开、同事打不开 = 防火墙没放行**，双击 **开放防火墙.bat** 一次即可（需要点 UAC 的「是」）。

**一键诊断：双击 `诊断.bat`**，会在同目录生成 `诊断报告.txt`（8 项：便携 Node / 构建产物 / 写权限 / 权限 + 端口归属（`FREE`/`USED-MR` 本系统/`USED-OTHER` 别的程序）+ 占用端口的进程名 + 防火墙规则 / PowerShell 版本与执行策略 / 网络盘映射 / `.run` 状态 / 实际尝试启动一次并把日志一起附上）。把该文件发回即可定位。

补充开关与环境变量：

- `MR_NOBROWSER=1`：启动时不自动打开浏览器（服务器/无人值守）。
- `MR_DIRECT=1`：跳过 PowerShell，直接用 `serve-direct.cmd` 启动。
- 日志固定在 `.run\logs\`：生产看 `prod.err.log` / `prod.out.log`；开发模式（`pnpm dev`）直接打印在控制台。

---

## 字段映射(Excel → Demo 表)

| Excel 真实表头 | 我们的字段 id | 类型 |
|---|---|---|
| 序号 | serial_no | autonumber（自动序号 1..N，只读） |
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
│   │   │   ├── auth/        登录 + JWT + 用户管理
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
│   │   │   └── permissions/ 表格级 + 列级权限
│   │   └── data/            运行时数据(默认 <repo>/apps/server/data)
│   └── web/
│       ├── src/
│       │   ├── pages/       Login / TablesList / Table / Users / SchemaEditor / Options / Stats / Audit
│       │   ├── components/  CellEditor / ImagePreview(+Gallery)
│       │   ├── stores/      authStore / viewStore(localStorage)
│       │   └── lib/         api / socket / types
│       └── dist/
├── docs/plan.md
├── scripts/                 构建 / 发布 / 热更新 / 启动 / 诊断脚本
│   ├── build-prod.ps1       tsc + vite 生产构建
│   ├── make-release.ps1     生成发布包（esbuild bundle）
│   ├── make-hotfix.ps1      生成 ~5MB 热更新包
│   ├── setup-runtime.ps1    下载便携 Node（仅开发机）
│   ├── start-prod.ps1       stop-prod.ps1   serve-direct.cmd   uncroot.cmd
│   └── hotfix/应用热更新.bat
├── 启动服务.bat / 停止服务.bat / 设置密码.bat / 开放防火墙.bat / 诊断.bat
└── README.md
```

根目录的 bat 与发布版**完全一致**：源码里不再有开发/装环境/Windows 服务的额外启动器，构建入口统一走 `scripts\*.ps1` 与 `pnpm` 命令。

---

## 关键技术决定

- **公式引擎**: expr-eval + 自定义函数(SUMARGS / WEEKNUM / MONTH / IF 等)
- **图片鉴权**: assetId 12 字符 nanoid(64 位熵)当隐式密钥,asset GET 公开(私有内部工具)
- **存储**: JSON 文件 + 进程内 mutex;读取时按需重算公式
- **分页**: `GET /api/tables/:id/rows?page=1&pageSize=50&sort=<colId>&dir=asc`。每页最多 50 条(服务端封顶),默认按录入顺序倒序 = 最新在前;排序与翻页都在服务端完成,所以只对当前页重算公式列,大表也不会把整表塞给浏览器。前端缓存按「表 + 页码 + 排序」分开,同一页只保留 50 条。
- **导入**: SheetJS (xlsx) + 按 Excel 表头名匹配目标字段
- **实时同步**: Socket.IO 房间订阅 + WS 广播 row.* / schema.updated
- **个人视图**: localStorage `mr:view:<tableId>` 存列宽/隐藏/排序

---

## 下一步(进入正式开发)

详见 [docs/plan.md §10 里程碑](docs/plan.md)。演示通过后,从 P1(JSONL 生产级存储层)开始按里程碑推进。