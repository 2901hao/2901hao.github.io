# 2901班官网 · 后端实现说明

本文说明网站每个功能在后端是怎么实现的：用了哪些表、哪些接口、有哪些限制，以及隐私上的取舍。前端是纯静态页面（HTML/CSS/JS，托管在 GitHub Pages），所有数据都经过后端接口。

## 1. 总体架构

| 部分 | 实现 |
|---|---|
| 前端 | 静态页面：`index.html`（首页）、`sports/`（运动会）、`school/`（辽宁省中学大战游戏）、`forum/`（论坛，单文件 SPA，hash 路由）；`shared/` 放公共脚本和样式 |
| 后端 | Cloudflare Pages Functions，代码在后端仓库 `functions/api/` 下 |
| 数据库 | Cloudflare D1（绑定变量名 `DB`），SQLite 语法 |
| 接口地址 | `https://api.ssy2901.abrdns.com` |
| 文件存储 | GitHub 私有仓库（见第 10 节），不使用 R2 |

后端文件：

- `functions/api/[action].js`：账号、存档、排行榜、头像、注销账户（游戏和全站共用）。
- `functions/api/forum/[action].js`：论坛的全部接口（帖子、评论、投票、问卷、话题、收藏、主页、私信、网盘等）。
- `functions/api/avatar/[name].js`：按用户名读取头像图片。

接口约定：

- 所有接口都是 `POST /api/<action>`（论坛是 `/api/forum/<action>`），请求体为 JSON，登录令牌放在请求体的 `token` 字段里。网盘上传是例外（第 10 节）。
- 返回 JSON：成功 `{ ok: true, ... }`；失败 `{ ok: false, error: "中文提示", code: "错误码" }`。前端按 `code` 查 `err.<code>` 翻译成当前语言，没有 `code` 才显示后端中文原文。
- 令牌无效或超过 30 天，返回 401，前端自动退出登录。
- 论坛表在第一次请求时自动创建（`ensureSchema`：`CREATE TABLE IF NOT EXISTS` + 一组 `ALTER TABLE`，列已存在的报错会被忽略），升级时不需要手动执行 SQL。
- 管理员是用户名 `admin`、`root` 的账号（`ADMINS` 常量）。

## 1.1 界面风格（纯前端）

界面风格有三套（纸白宋体 / 玻璃 / Material 谷歌设计语言），由 `shared/skin.js` 在 `<html data-skin>` 上切换，样式写在 `shared/skins.css`，选择保存在浏览器 localStorage，不涉及后端。

## 2. 账号与登录

- **表**：`users(username, password, created_at)`、`sessions(token, username, created_at)`。
- **注册 / 登录**（`register` / `login`）：用户名最长 32 位；注册时检查密码强度（`pwError`）；登录成功生成随机 token 写入 `sessions`，有效期 30 天。
- **密码存储**：设置了 Secret `PW_KEY` 后，密码用 AES-GCM 加密存储（密钥由 `PW_KEY` 经 SHA-256 得到），不是哈希：是为了让管理员在同学忘记密码时能查看（`admin_get_password`）。没设置 `PW_KEY` 时是明文（旧行为），设置后新密码和旧账号登录时会自动变成密文，`admin_encrypt_all` 可一次性加密所有旧密码。
- **修改密码**（`change_password`）：校验旧密码后更新。
- **退出**（`logout`）：删除对应 `sessions` 行。
- **注销账户**（`delete`）：删除用户及其全部数据——存档、头像，以及论坛里的帖子、回复、点赞、投票、问卷、私信、关注、网盘文件等（`purgeForum`）。管理员账号不可注销；管理员可以强制注销别人（`admin_delete_user`，用同一套清理逻辑 `userContentCleanup`）。

## 3. 游戏存档、排行榜、头像

- **存档**：`saves(username, data)`，`data` 是前端上传的 JSON 字符串，最大 20000 字符。`load` / `save` 读写。
- **防作弊**：积分由前端算，服务器不信任上报数值，而是用“令牌桶”限速——每秒最多增长 `RATE = 4` 分，桶容量 `CAP = 120` 分；积分只允许减少（清空进度）或限速增长；学校名必须在白名单 `SCHOOL_NAMES` 里；各校积分 `spts` 由服务器求和得出总分。
- **排行榜**（`rank`）：读取全部存档，按学校总积分、个人总积分聚合；`admin`、`root` 不上榜。
- **头像**：`avatars(username, mime, data, updated_at)`，前端压缩后以 base64 上传（`avatar_set`，上限约 150000 字符），`avatar_remove` 删除；`/api/avatar/<name>` 返回图片。`updated_at` 作为版本号，前端据此缓存。

## 4. 论坛：帖子、评论、点赞

- **表**：`posts`、`replies`、`likes`、`reply_likes`。
- **发帖**（`create`）：标题 ≤ 60 字、正文 ≤ 2000 字；同一用户两次发帖间隔 ≥ 20 秒（管理员不受限）。最多保留 2000 个帖子，每发 20 个帖子顺手清理最久没动静的，并清掉孤儿数据（回复、点赞、投票、话题、置顶、收藏、网盘附件关系）。
- **列表**（`list`）：支持排序（最近活动 / 最新 / 赞数 / 回复数 / 收藏数，升降序）、话题、标签、关键字搜索、“我关注的人”动态（`feed: 'following'`），每页 20 条，用 `offset` 翻页；`pinned` 数组单独返回置顶帖。点赞数、收藏数用子查询算出。
- **详情**（`post`）：帖子 + 全部回复（最多 100 条）+ 投票 + 附件 + 当前用户能在哪些范围置顶。
- **多层评论**（`reply`）：`replies` 带 `parent_id`、`depth`、`reply_to`；最多 3 层（`MAX_DEPTH = 2`），更深的回复归到第 3 层并记下回复的是谁；单条 ≤ 300 字，间隔 ≥ 5 秒。
- **删除评论**（`delete`）：有人回复过的评论只清空内容并标记 `deleted`（前端显示“已删除”占位），没人回复的直接删；删光子评论后向上清理空占位（`removeReply`）。
- **编辑**（`post_edit`、`reply_edit`）：只能改自己的，记录 `edited_at`。
- **点赞**（`like`、`reply_like`）：主键 `(post_id, username)`，重复点即取消；接口只返回数量。
- **删帖**：作者或管理员可删，同时删掉评论、点赞、投票、话题关联、置顶、收藏、附件关系。

## 5. 话题、标签、置顶、收藏

- **话题**：`topics(id, name, descr, creator)`；`post_topics(post_id, topic_id)`。任何人可建话题（间隔 ≥ 10 秒，总数上限 200），名称唯一；创建者或管理员可删除、合并（`topic_merge`：把一个话题的帖子并入另一个）。一个帖子最多 3 个话题。
- **标签**：`post_tags(post_id, tag)`（不区分大小写），一个帖子最多 5 个，每个 ≤ 20 字，无需预先创建。
- **改话题/标签**（`post_meta`）：作者或管理员。
- **置顶**（`pin`）：`pins(scope, post_id, created_at, expires_at, by)`。`scope` 是 `global` 或 `topic:<id>`。管理员能置顶到全站，话题创建者能置顶到自己的话题；每个范围最多 3 条；默认不过期，可设过期时间，读取时过滤已过期的。
- **收藏**：`bookmarks(username, post_id, folder_id)`、`bookmark_folders`（每人最多 20 个收藏夹）；`bookmark`、`folder_*`、`bookmark_list` 管理。收藏数只对外显示数量。

## 6. 投票与问卷

- **帖子投票**：`polls(post_id, multi, closes_at, options, anon, vis)`、`poll_votes(post_id, username, opt)`。2–10 个选项，可多选，可设截止时间。
- **问卷**：`surveys`、`survey_responses`，支持单选 / 多选 / 填空题，最多 20 题。
- **匿名与可见性由发起人自选**（`anon`：匿名/实名；`vis`：投完才可看 / 所有人可看 / 仅发起人；问卷的填空内容是否公开 `texts_public`）。数据库里始终存了用户名（用于“每人限一次”），匿名时接口不返回任何人的选择；实名时才返回投票人名单。
- 接口：`poll_vote`、`survey_create`、`survey_list`、`survey_get`、`survey_submit`、`survey_results`、`survey_close`、`survey_delete`。

## 7. 个人主页与关注

- **表**：`profiles(username, bio, show_posts, show_comments, show_likes, show_marks, show_follows)`、`follows(follower, followee)`。
- **主页**（`profile`）：简介 ≤ 200 字，统计（帖子数、评论数、获赞数、粉丝、关注）；还会返回 `i_blocked`（我是否拉黑了对方）、`follows_me`、`followed_by_me`。
- **隐私**：简介、帖子、评论默认公开；赞过的、收藏默认私有；关注/粉丝列表默认公开；本人可逐项修改（`profile_set`）。查看别人的某个标签页（`profile_posts`，tab = posts / comments / likes / marks）时，后端按对方的隐私设置过滤，不公开就返回 `code: 'private'`。
- **关注**（`follow`）：不能关注自己；拉黑时会自动解除双方的关注关系（但拉黑之后对方仍可以再次关注，目前没有拦截）。`follow_list` 分页返回粉丝/关注。
- **找人**（`user_search`）：用户名包含关键字，用于私信搜索。

## 8. 私信、拉黑、举报

- **表**：`dm_convs(user_a, user_b, last_at, a_read, b_read, a_clear, b_clear)`（会话按用户名字典序配对，`UNIQUE(user_a, user_b)`）、`dm_msgs(conv_id, sender, body, recalled, created_at)`、`blocks(blocker, blocked)`、`dm_reports(reporter, reported, reason, msgs, status, handled_by, note)`。
- **发送**（`dm_send`）：≤ 500 字，两条消息间隔 ≥ 0.8 秒，每人每天最多 300 条；对方拉黑了你或你拉黑了对方都不能发（返回不同错误码）。可以只发附件、不写文字。
- **未读**：`a_read` / `b_read` 记录每一方读到的最大消息 id，`dm_unread` 用一条 SQL 汇总；前端每 30 秒轮询一次。打开聊天（`dm_messages`）即标记已读；聊天窗口每 5 秒用 `after=<最后一条 id>` 只取新消息，并返回对方已读到哪条（用于“已读”回执）。
- **撤回**（`dm_recall`）：只能撤回自己发的、10 分钟内的消息；撤回时把 `body` 清空（内容真的从数据库删除），只留“已撤回”占位。
- **清空**（`dm_clear`）：只清自己这边（把 `a_clear` / `b_clear` 推进到最新 id），对方不受影响；双方都清空后才真正删除这些行。
- **拉黑**（`block`）：写入 `blocks`，并同时解除双方的关注关系；`block_list` 查看黑名单；取消拉黑传 `on: false`。
- **举报**（`dm_report`）：举报人勾选若干条对方发来的消息（最多 20 条），后端把**被勾选的这几条**拷贝成快照存进 `dm_reports.msgs`，每人每天最多 10 次。
- **管理员看不到私信**：没有任何接口能让管理员列出或读取别人的会话；`report_list` / `report_handle` 只处理举报快照（只含举报人选中的那几条）。后端测试里专门断言了“管理员看不到别人的会话和未被举报的消息”。
- **诚实说明**：私信没有端到端加密，数据库里是明文，所以拥有后台（Cloudflare 账号）权限的维护者在技术上仍能读到——界面上的说明文字也是这样写的，没有宣称“绝对保密”。

## 9. 管理功能

- `admin_users`：列出所有用户及帖子/回复数（管理员专用）。
- `admin_delete_user`：强制注销用户（`userContentCleanup`，同时把该用户的网盘文件放入清理队列）。
- `admin_get_password` / `admin_encrypt_all`：查看密码 / 加密旧密码（第 2 节）。
- `report_list` / `report_handle`：处理私信举报（第 8 节）。
- 管理员可删除任何帖子和评论、置顶到全站。

## 10. 2901网盘与图片/附件

### 存储设计

文件内容存在 GitHub 私有仓库里，用的是 GitHub Contents API；D1 只存元数据。

- **配置**（Cloudflare 环境变量）：`GH_TOKEN`（Secret，细粒度令牌，Contents 读写）、`GH_OWNER`、`GH_REPOS`（仓库名，逗号分隔）、可选 `GH_BRANCH`。没配置时网盘接口返回 `drive_off`，论坛其他功能不受影响。配置步骤见《网盘配置说明.md》。
- **分仓**：每个仓库软上限约 800MB，按 `drive_files` 里各仓库已用大小，新文件放进第一个放得下的仓库；全满返回 `drive_full`。
- **路径**：仓库里的路径是随机的 `d/<前两位>/<24位随机id>`，文件名只存在 D1 里，仓库内容无法直接看出是谁的什么文件。
- **表**：
  - `drive_folders(owner, name, parent)`：文件夹，最多 3 层、每人 100 个，同一层不能重名。
  - `drive_files(id, owner, kind, name, folder, size, mime, repo, path, sha, share_all)`：`kind` 是 `file`（网盘文件）或 `img`（帖子/私信里的图片，不出现在网盘列表、不占网盘空间）。
  - `drive_shares(file_id, to_user)`：分享给指定的人。
  - `drive_att(file_id, kind, ref)`：附件关系，`kind` 为 `post` 或 `dm`，`ref` 是帖子 id / 私信消息 id。
  - `drive_gc(repo, path, sha, tries)`：待从 GitHub 删除的队列。

### 上传（`drive_upload`）

- 浏览器把文件读成 base64 文本作为请求正文，元数据（令牌、文件名、大小、类型、文件夹、`kind`）放在请求头 `X-Drive`（URL 编码的 JSON）里。
- 后端**不解析 JSON、不解码 base64**：在 Cloudflare 运行时里用 `FixedLengthStream` 把“`{"message":…,"content":"`” + 请求正文流 + “`"}`”拼成 GitHub 的 PUT 请求直接转发，所以 25MB 的文件也几乎不占 CPU 和内存。
- 校验：登录有效；`Content-Length` 必须等于 `ceil(size/3)*4`；单个文件 ≤ 25MB，网盘每人 ≤ 500MB，每天最多上传 100 个；图片每张 ≤ 2MB，每人 100MB，每天 40 张。图片必须是 JPEG/PNG/GIF/WebP，并在上传后读取文件头检查与声明类型一致，不一致就从 GitHub 删掉（防止拿图片接口当随便什么文件的图床）。
- 图片在浏览器端压缩（长边 ≤ 1600px，JPEG 质量逐步下调到 ≤ 2MB）后再上传。
- GitHub 返回 409（并发写入冲突）时返回 `drive_busy`，前端自动重试一次。

### 下载（`drive_get`）

- 先检查权限，再从 GitHub 以 `application/vnd.github.raw+json` 读取并**流式转发**给浏览器（不落盘、不整体读入内存）。
- 有权限的人：文件所有者；`share_all` 为真时所有登录用户（且双方没有拉黑关系）；`drive_shares` 里指定的用户；附在某个帖子上的文件/图片，所有登录用户；附在某条私信上的，只有这个会话的两个人。
- **管理员没有额外权限**：不能下载别人的私有文件，也看不到私信里的图片。
- 响应头：文件强制 `Content-Disposition: attachment`，HTML/SVG/JS/XML 一律按 `application/octet-stream` 返回；图片按图片类型返回；都带 `X-Content-Type-Options: nosniff` 和 `Content-Security-Policy: sandbox`，避免被当作页面执行。没有公开链接，浏览器必须带着令牌 POST 才能取到内容（前端用 blob URL 显示图片/触发下载）。

### 文件管理与分享

`drive_list`（文件夹内容、面包屑、已用空间）、`drive_folder_create/rename/delete`（只能删空文件夹）、`drive_rename`、`drive_move`、`drive_delete`、`drive_share`（`all` 所有登录同学可见 + `users` 指定最多 20 人）、`drive_shared`（别人分享给我的，已拉黑的人的文件不显示）。

### 附件

- 发帖（`create` 的 `att` 参数）：最多 9 张图片 + 5 个文件；私信（`dm_send` 的 `att`）：1 个。附件必须是自己的文件，校验在写入帖子/消息**之前**完成。
- 帖子详情（`post.atts`）和私信列表（`dm_messages` 里每条的 `atts`）带回附件信息。
- 删帖、撤回私信时 `dropAtts`：只挂在这里的图片放入清理队列并删除元数据；网盘文件只是解除关联，文件本身还在网盘里。

### 清理机制

- 所有删除（删文件、删帖里的图片、撤回私信的图片、注销账号）都只改数据库，并把 GitHub 上的 `repo/path/sha` 写入 `drive_gc`；之后在打开网盘页、删文件等操作里顺带处理，每次最多删 2–3 个，失败会重试，最多 6 次后放弃。
- 兜底清理（`sweepDrive`）：删除已没有对应帖子/私信的附件关系，并清理超过 2 小时仍没挂到任何地方的图片（比如上传后没发布就关了页面）。

## 11. 限流与上限汇总

| 项目 | 限制 |
|---|---|
| 登录有效期 | 30 天 |
| 发帖 | 标题 60 / 正文 2000 字，间隔 20 秒，保留 2000 帖 |
| 回复 | 300 字，间隔 5 秒，每帖 100 条，3 层 |
| 话题 / 标签 | 每帖 3 话题、5 标签，话题总数 200，建话题间隔 10 秒 |
| 置顶 | 每个范围 3 条 |
| 收藏夹 | 每人 20 个 |
| 简介 | 200 字 |
| 私信 | 500 字，间隔 0.8 秒，每天 300 条，撤回 10 分钟 |
| 举报 | 每次最多 20 条消息，每人每天 10 次 |
| 网盘 | 单文件 25MB，每人 500MB，每天上传 100 个，文件夹 100 个 / 3 层，分享最多 20 人 |
| 图片 | 每张 2MB，每人 100MB，每天 40 张，发帖最多 9 张 |

## 12. 测试方式

没有连线上后端，测试都是在本地模拟：

- **后端测试**：用 Node 的 `node:sqlite` 做一个 D1 的替身，直接调用后端的 `onRequestPost`，并用假的 `fetch` 模拟 GitHub Contents API，覆盖账号清理、点赞、投票、问卷、话题、置顶、收藏、评论、主页、私信、拉黑、举报、网盘上传/下载/分享/配额/分仓/清理等，上百条断言。
- **浏览器测试**：Playwright + Chromium，把前端发往后端的请求转给上面的替身，用 alice / bob / admin 三个账号走完主要流程（私信轮询与已读、举报后管理员只看到被选中的消息、网盘上传下载分享、帖子/私信图片），并检查手机宽度下没有横向溢出。

## 13. 已知局限

- 私信不是端到端加密（见第 8 节）。
- 评论里不能带附件；发出去的帖子不能再增删附件。
- GitHub Contents API 对单仓库的并发写入会串行化，同时有很多人上传时可能出现 `drive_busy`，重试即可。
- 令牌（`GH_TOKEN`）到期后网盘会报“存储服务出错”，需要重新生成并替换。
- 密码是可还原的加密而不是哈希，这是为了让管理员能帮忘记密码的同学找回；要更高安全性应改成哈希并去掉查看密码功能。
