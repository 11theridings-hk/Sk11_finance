# FINNE18 - 财务收支记录程序

本项目是一个侧重于手机端使用的 H5 财务收支记录程序，包含收支数据录入、资金池管理、分类管理、用户管理以及报表和 PDF 导出功能。项目前端与后端均基于 Next.js 16 + App Router + Prisma (SQLite) 打造，并且所有的样式基于 Tailwind CSS 实现移动端优先与高信息密度的设计。

## 开发手册与文档

详细的产品需求文档（PRD）和开发手册，请参考根目录下的 [development_manual.md](./development_manual.md)。

## 如何启动与使用

1. **安装依赖**
   ```bash
   npm install
   ```

2. **数据库初始化**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   ```

4. **系统初始化与首次登录**
   - 项目启动后，请在浏览器中访问：`http://localhost:3000/api/init`，这会自动为您创建一个默认的超级管理员账户（密码为：`admin`）。
   - 然后访问：`http://localhost:3000/login`，在“管理员登录”选项卡中输入 `admin` 即可登录并进入后台进行各项配置（分类、资金池、用户白名单等）。

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