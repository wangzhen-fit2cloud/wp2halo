#!/usr/bin/env node

const dotenv = require("dotenv")
dotenv.config()
const chalk = require('chalk');
const compareVersions = require('compare-versions');
const path = require('path');
const process = require('process');
const fs = require('fs');

const parser = require('./src/parser');
const writer = require('./src/writer');

async function import2halo(posts, config) {

    const tags = await parser.getAllTags(config)
    const categories = await parser.getAllCategories(config)

    // start import to halo
    const { AdminApiClient, HaloRestAPIClient } = require("@halo-dev/admin-api");
    //halo http 请求客户端.
    const haloRestApiClient = new HaloRestAPIClient({
        baseUrl: process.env.HALO_BASE_URL,
        auth: { adminToken: process.env.ADMIN_TOKEN },
    });
    // 通过 haloRestApiCLient 创建 adminApiClient。
    const haloAdminClient = new AdminApiClient(haloRestApiClient);

    let successCount = 0;
    let failCount = 0;
    let haloPosts = [];
    console.log("== HALO ==", "Start to import Posts and their attachments...");
    await haloAdminClient.post.list({ size: 1000 }).then((res) => {
        haloPosts = res.data.content;
    });
    for (const post of posts) {
        console.log("== HALO ==", "processing post", "id: " + post.meta.id, "title: " + post.frontmatter.title);
        if (haloPosts.find(item => item.title === post.frontmatter.title)) {
            console.log(chalk.blue('[SKIP]'), 'post of this title already exist');
            continue;
        }
        let postPath = writer.getPostPath(post, config);
        let postRS = fs.createReadStream(postPath);
        try {
            let images = fs.readdirSync(postPath + "/../images");
            // 替换文章内容中的图片地址为图片上传后的实际地址
            for (const image of images) {
                let imagesRs = fs.createReadStream(postPath + "/../images/" + image);
                await haloAdminClient.attachment.upload(imagesRs)
                    .then(res => {
                        let uploadedImagePath = res.data.path;
                        let contentReg = new RegExp('(\\!\\[.*?\\]\\()(images\\/' + image + ')(\\))', "gi");
                        if (image === post.frontmatter.coverImage) {
                            post.frontmatter.coverImage = uploadedImagePath;
                        }
                        post.content = post.content.replace(contentReg, "$1" + uploadedImagePath + "$3");
                        console.log("== HALO ==:", chalk.green('[OK]'), "upload image " + uploadedImagePath + " success", res.message);
                    })
                    .catch(e => {
                        console.log("== HALO ==:", chalk.red('[ERROR]'), " upload images failed\n----------\n", e, '\n---------\n');
                    });
            }
        } catch (error) {
            console.log(chalk.blue('[SKIP]'), 'image dir of this post not exist');
        }

        let haloPost = Object;
        // 通过文章导入接口导入markdown文章
        await haloAdminClient.backup.importMarkdown(postRS)
            .then(res => {
                console.log("== HALO ==: import " + res.data.title + " succeed", res.message);
                haloPost = res.data;
                haloPost.content = post.content;
                haloPost.thumbnail = post.frontmatter.coverImage === undefined ? '' : post.frontmatter.coverImage;
                successCount = successCount + 1;
            })
            .catch(e => {
                console.log("== HALO ==:", chalk.red('[ERROR]'), " import failed\n----------\n", e, '\n----------\n', post.meta);
                failCount = failCount + 1;
            });
        // 使用替换过图片地址后的内容更新已导入的文章

        await haloAdminClient.post.update(haloPost.id, haloPost)
            .then(res => {
                console.log("== HALO ==:", chalk.green('[OK]'), " update " + haloPost.id + " succeed", res.message);
            })
            .catch(e => {
                console.log("== HALO ==:", chalk.red('[ERROR]'), " update " + haloPost.id + " failed\n----------\n", e, '\n----------\n', post.meta);
            });

    }
    // 更新分类目录名称及层级关系
    await haloAdminClient.category.list()
        .then(async res => {
            const haloCategories = res.data;
            haloCategories.forEach(async haloCategory => {
                const wpCategory = categories.find(item => decodeURI(item.term_slug) === haloCategory.slug);
                if (!(wpCategory === undefined)) {
                    const haloCategoryParent = haloCategories.find(item => item.slug === decodeURI(wpCategory.term_parent));
                    haloCategory.parentId = !(haloCategoryParent === undefined) ? haloCategoryParent.id : 0;
                    haloCategory.name = wpCategory.term_name[0];
                }
            })
            await haloAdminClient.category.updateInBatch(haloCategories)
                .then(res => {
                    console.log("== HALO ==:", chalk.green('[OK]'), " update categories success\n----------\n", res.message, '\n---------\n');
                }).catch(e => {
                    console.log("== HALO ==:", chalk.red('[ERROR]'), " update categores success\n----------\n", res.message, '\n---------\n', haloCategories);
                });
        });
}

(async() => {
    // Node version check
    const requiredVersion = '12.14.0';
    const currentVersion = process.versions.node;
    if (compareVersions(currentVersion, requiredVersion) === -1) {
        throw `This script requires Node v${requiredVersion} or higher, but you are using v${currentVersion}.`;
    }

    // using static config
    const config = {
        version: 'v2.2.2',
        wizard: false,
        input: 'export.xml',
        output: 'output',
        yearFolders: false,
        monthFolders: false,
        postFolders: true,
        prefixDate: false,
        saveAttachedImages: true,
        saveScrapedImages: false,
        includeOtherTypes: false
    };

    // parse data from XML and do Markdown translations
    const posts = await parser.parseFilePromise(config)

    // write files, downloading images as needed
    await writer.writeFilesPromise(posts, config);

    // happy goodbye
    console.log('\nAll done!');
    console.log('Look for your output files in: ' + path.resolve(config.output));

    await import2halo(posts, config);

})().catch(ex => {
    // sad goodbye
    console.log('\nSomething went wrong, execution halted early.');
    console.error(ex);
});