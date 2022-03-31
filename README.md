# wp2halo

在 [wordpress-export-to-markdown](https://github.com/lonekorean/wordpress-export-to-markdown) 项目的基础上，增加了将转换后的 markdown 文章及对应图片附件上传到 [Halo](https://halo.run) 中的脚本。

## 快速开始

### 准备工作
- Node.js v12.14 及以上
- 从 Wordpress 中导出的 XML 文件（导出时选择 `所有内容` 选项)

### 克隆项目
```bash
git clone https://github.com/wangzhen-fit2cloud/wp2halo
cd wp2halo
```

### 配置环境变量
修改 .env 文件中的变量值为要导入的 Halo 环境地址及 token

### 执行脚本
```bash
npm insall
node wp2halo.js
```
