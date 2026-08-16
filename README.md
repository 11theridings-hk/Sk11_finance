# FINNE18 - 财务收支记录程序

本项目是一个侧重于手机端使用的 H5 财务收支记录程序，包含收支数据录入、资金池管理、分类管理、用户管理以及报表和 PDF 导出功能。项目前端与后端均基于 Next.js 16 + App Router + Prisma (PostgreSQL) 打造，并且所有的样式基于 Tailwind CSS 实现移动端优先与高信息密度的设计。

## 开发手册与文档

详细的产品需求文档（PRD）和开发手册，请参考根目录下的 [development_manual.md](./development_manual.md)。

## 如何启动与部署

1. **配置环境变量**
   在根目录创建 `.env` 文件，配置你的 PostgreSQL 连接与初始化密钥：
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/finance"
   JWT_SECRET="your-super-secret-jwt-key"
   PWD_SALT="your-password-salt"
   INIT_SECRET="your-init-secret"
   ```

2. **安装依赖**
   ```bash
   npm ci
   ```

3. **数据库初始化与迁移**
   请使用 Prisma Migrate 来初始化或升级生产数据库：
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

4. **系统初始化与首次登录**
   - 首次部署后，需要创建超级管理员。请访问：`http://your-domain/api/init?secret=your-init-secret` (这里的 secret 需要与 `.env` 中一致)。这会自动为您创建一个默认的超级管理员账户（密码为：`admin`）。
   - 访问 `/login`，在“管理员登录”中输入 `admin` 即可登录并进入后台修改密码及配置白名单。

## 核心功能说明
- **普通用户/管理员双登录**：无账号名设计，凭白名单密码直接登录。
- **高信息密度录入**：包含收入（淡蓝）、支出（淡红）双模板，支持上传凭证并自动在前端压缩为 `200KB` 以下，防止空间浪费。
- **防呆倒计时设计**：提交后二次确认拥有 5 秒倒计时，避免重复点击与误操作。
- **动态图表与 PDF 导出**：支持列表 PDF 及逐条带凭证图片的会计明细压缩包 (Zip) 下载。

## 技术栈
- **Next.js (App Router)**
- **Tailwind CSS**
- **Prisma + SQLite**
- **jspdf, jspdf-autotable, jszip** (用于报表导出)
- **browser-image-compression** (用于前端图片压缩)