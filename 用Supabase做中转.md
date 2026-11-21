# 用 Supabase 当"中转站"（后端和数据不动）

思路：浏览器能连上 `xxx.supabase.co`，而 Supabase 的服务器能连上 Cloudflare 后端（服务器之间不受国内封锁影响）。
所以在 Supabase 上放一个 **Edge Function**，把 `/api/...` 请求原样转给 Cloudflare 后端，再把回应原样送回来。

```
浏览器 ──→ xxx.supabase.co/functions/v1/api-proxy ──→ Cloudflare 后端（D1 数据库、GitHub 网盘都在这里）
```

- 数据库、账号、网盘、定时清理全都还在 Cloudflare 上，**不用迁移任何数据**，后端代码一行不改。
- 转发函数只有几十行，在 `relay/supabase/functions/api-proxy/index.ts`。
- 前端从 `shared/api-config.json` 读地址列表，这个地址和别的地址一样当备用/主用都行。

## 部署步骤（约 10 分钟，用 Supabase CLI）

1. 注册 Supabase，新建一个项目，记下 **Project ref**（项目网址 `https://<ref>.supabase.co` 里的 `<ref>`，也在 Project Settings → General）。
2. 本机安装 Supabase CLI（`npm i -g supabase`，或看官方文档），然后在 `relay/` 目录里：
   ```bash
   cd relay
   supabase login
   supabase link --project-ref <ref>
   supabase secrets set UPSTREAM=https://api.ssy2901.abrdns.com     # 真正的后端地址（Cloudflare 那个）
   supabase functions deploy api-proxy --no-verify-jwt
   ```
   `--no-verify-jwt` 必须加（本站用自己的登录令牌，不用 Supabase 的）。
3. 浏览器打开 `https://<ref>.supabase.co/functions/v1/api-proxy/api/ping`，看到后端的正常返回就通了。**用国内网络（手机流量）也试一次。**
4. 把地址写进 `shared/api-config.json`（放最后，当备用），推送前端：
   ```json
   { "bases": [
       "https://api.ssy2901.us.ci",
       "https://api.ssy2901.abrdns.com",
       "https://<ref>.supabase.co/functions/v1/api-proxy"
   ] }
   ```
   顺序就是优先级：先用原来的地址，不通才用 Supabase 中转（原地址恢复后会自动切回）。

不想装 CLI 也可以：Supabase 网页控制台 → Edge Functions → Create a new function，名字填 `api-proxy`，把 `index.ts` 的内容粘贴进去部署，并在函数设置里关闭 "Enforce JWT Verification"；在 Edge Functions → Secrets 里添加 `UPSTREAM`。

## 要留意的地方

- **额度**：免费版 Edge Function 每月约 50 万次调用。论坛私信页会每 30 秒查一次未读、聊天页每 5 秒刷新一次，人多时调用数涨得快；超了要换付费版（或换别的中转方式）。
- **闲置暂停**：Supabase 免费项目长时间没活动会被暂停，暂停后函数不能用。网站仓库里已经带了 `.github/workflows/keepalive.yml`：每天北京时间 23:50 自动访问一次 `shared/api-config.json` 里每个地址的 `/api/ping`（见下面“保活”一节）。
- **大文件**：网盘上传（最大 25MB）也会经过这个函数，受 Supabase 的执行时长和请求大小限制；上传失败时试试小文件，或让上传走别的地址。
- **这个域名也可能被封**：`supabase.co` 是共用域名，目前能连不代表永远能连，所以仍建议保留多个地址。
- 转发函数不保存任何数据，也不看内容（登录令牌和密码只是经过）。部署在你自己的 Supabase 项目里，别把项目访问权限给别人。

## 保活（防止 Supabase 被暂停）

仓库里的 `.github/workflows/keepalive.yml` 是 GitHub Actions 定时任务：

- 每天北京时间 23:50（UTC 15:50）自动运行，对 `shared/api-config.json` 里的每个后端地址请求一次 `/api/ping`。GitHub 的定时任务有时会晚几分钟到十几分钟。
- 不去判断“当天有没有人访问过”：Supabase 的访问日志拿不到，而且多发一次请求没有副作用，效果和“没有才补发”一样。
- 只要有一个地址通就算成功；某个地址失败会在运行记录里标黄色警告；全都不通才算失败，GitHub 会给你发邮件。
- 想手动试一下：仓库 → Actions → keepalive → Run workflow。
- 如果觉得只访问函数不算“数据库活动”，可以在仓库 Settings → Secrets and variables → Actions 里加两个 secret：`SUPABASE_URL`（如 `https://eepipyczkikjerjtmnki.supabase.co`）和 `SUPABASE_ANON_KEY`（Supabase 项目 Settings → API Keys 里的 anon / publishable key），任务会再访问一次它的数据接口。
- 每天都会请求（不判断当天有没有人访问），每个地址最多重试 4 次。每周日还会自动提交一次时间戳文件 `.github/keepalive-last.txt`，这样仓库不会因为 60 天没有提交，被 GitHub 停掉定时任务。若仓库设置了分支保护导致不能自动提交，需要关掉保护或手动提交。
- 上传到 GitHub 后，到 Actions 页面确认能看到 keepalive；网页拖拽上传有时会漏掉以 `.` 开头的文件夹（`.github`），看不到的话需要单独补上传。
