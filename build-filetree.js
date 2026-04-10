const fs = require('fs');
const path = require('path');
const { readdir, writeFile } = require('fs/promises');

// ================= 配置 =================
const ROOT = __dirname;
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.vuepress', 'docs', 'data']);
const IGNORE_FILES = new Set(['filetree.json', '.DS_Store', 'desktop.ini', 'README.md']);

const toUnixPath = (p) => p.split(path.sep).join('/');
const getRepoPath = (fullPath) => toUnixPath(path.relative(ROOT, fullPath));

// ================= 判断逻辑 =================

async function shouldGenerateTree(dirPath, entries) {
    const folderName = path.basename(dirPath);

    // 1. 绝对排除：自己就是 "_附件" 或者是根目录，或者在忽略名单中
    if (folderName === '_附件' || IGNORE_DIRS.has(folderName) || dirPath === ROOT) {
        return false;
    }

    // 2. 必要条件：必须有 README.md
    const hasReadme = entries.some(e => e.isFile() && e.name.toLowerCase() === 'readme.md');
    if (!hasReadme) return false;

    // 3. 区分“课程”与“分类目录”：
    // 我们认为一个文件夹是“课程资源包”，只要它满足以下任一条件：
    const isCourse = entries.some(e => {
        // 条件 A: 含有名为 "_附件" 的子目录
        if (e.isDirectory() && e.name === '_附件') return true;

        // 条件 B: 含有真正的资源文件（排除掉 readme, json 和隐藏文件）
        if (e.isFile()) {
            const name = e.name.toLowerCase();
            const ext = path.extname(name);
            if (name !== 'readme.md' && ext !== '.json' && !name.startsWith('.')) {
                return true;
            }
        }
        return false;
    });

    return isCourse;
}

// ================= 递归构建文件树 =================

async function buildTreeData(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const tree = [];

    for (const entry of entries) {
        // 剔除不需要展示在下载树里的文件
        if (IGNORE_FILES.has(entry.name)) continue;
        if (entry.isFile() && entry.name.toLowerCase() === 'readme.md') continue;
        if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;

        const fullPath = path.join(currentDir, entry.name);
        const repoPath = getRepoPath(fullPath);

        if (entry.isDirectory()) {
            const children = await buildTreeData(fullPath);
            // 记录文件夹及其子内容
            tree.push({
                name: entry.name,
                type: 'directory',
                path: repoPath,
                children: children
            });
        } else {
            tree.push({
                name: entry.name,
                type: 'file',
                path: repoPath,
                ext: path.extname(entry.name)
            });
        }
    }
    return tree.sort((a, b) => (b.type === 'directory') - (a.type === 'directory'));
}

// ================= 遍历扫描 =================

async function scan(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    // 判定当前目录是否需要生成 filetree.json
    if (await shouldGenerateTree(currentDir, entries)) {
        console.log(`📦 识别到资源包: /${path.relative(ROOT, currentDir)}`);
        const tree = await buildTreeData(currentDir);

        if (tree.length > 0) {
            await writeFile(
                path.join(currentDir, 'filetree.json'),
                JSON.stringify(tree, null, 2),
                'utf8'
            );
        }
    }

    // 继续向下递归
    for (const entry of entries) {
        if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
            await scan(path.join(currentDir, entry.name));
        }
    }
}

// ================= 执行 =================
console.log('🚀 启动智能识别脚本...');
scan(ROOT).then(() => {
    console.log('\n✅ 执行完成。');
}).catch(err => console.error(err));