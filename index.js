#!/usr/bin/env node

const os = require('os');
const fs = require('fs');
const tar = require('tar-stream');
const tmp = require('tmp');
const path = require('path');
const move = require('move-concurrently');
const { Gzip:gzip, Gunzip:gunzip } = require('zlib');
const getStream = require('get-stream');

const package = JSON.parse(fs.readFileSync('./package.json'));

if(!Object.fromEntries)
    Object.fromEntries = arr => Object.assign({}, ...Array.from(arr, ([k, v]) => ({[k]: v}) ));

const name = package.name[0] === '@' ? package.name.substr(1).replace(/\//g,'-') : package.name;
const target = `${name}-${package.version}.tgz`;

if(!fs.existsSync(target))
    process.exit(0);

const tmpTgz = tmp.tmpNameSync({prefix:`${name}-${package.version}-`, postfix:'.tgz'});

const extract = tar.extract();
const pack = tar.pack();

const defaultKeepKeys = [
    "name",
    "version",
    "description",
    "keywords",
    "homepage",
    "bugs",
    "license",
    "author",
    "contributors",
    "main",
    "browser",
    "bin",
    "man",
    "directories",
    "repository",
    "config",
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "engines",
    "os",
    "cpu",
    "private"
];

const defaultRemoveKeys = [
    "files",
    "scripts",
    "devDependencies",
    "bundleDependencies",
    "postpack"
];

const postpack = package.postpack || {};

const   keepKeys = [ ...(postpack.keep   || defaultKeepKeys  ), ...(postpack.keepDefaultAnd   || []) ];
const removeKeys = [ ...(postpack.remove || defaultRemoveKeys), ...(postpack.removeDefaultAnd || []) ];

const knownKeys = [ ...keepKeys, ...removeKeys ];
const unknownKeys = Object.keys(package).filter( key => !knownKeys.includes(key) );

if(unknownKeys.length) {
    console.error("POSTPACK: Unknown keys:", unknownKeys);
    console.error("POSTPACK: Abort");
    process.exit(1);
}

extract.on('entry', async (header, stream, next) => {

    if(header.name==='package/package.json') {
        const oldPackage = JSON.parse(await getStream(stream));
        const newPackage = Object.fromEntries(Object.entries(oldPackage).filter(([key, value]) => keepKeys.includes(key)));

        const newPackageJson = JSON.stringify(newPackage, null, 2)+os.EOL;

        // FIXME: https://github.com/mafintosh/tar-stream/issues/110
        pack.entry({ ...header}, newPackageJson, next);
    } else {
        stream.pipe(pack.entry(header, next));
    }
});

extract.on('finish', async () => {
    pack.finalize();
});

const readStream = fs.createReadStream(target);
const writeStream = fs.createWriteStream(tmpTgz);

writeStream.on('close', async () => {
    await move(tmpTgz, target);
});

readStream.pipe(gunzip()).pipe(extract);
pack.pipe(gzip()).pipe(writeStream);
