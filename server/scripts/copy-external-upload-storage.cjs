const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
function canonicalTarget(input) {
  const absolute = path.resolve(input);
  let ancestor = absolute;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  return path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute));
}
function planCopy(source, destination) {
  const from = fs.realpathSync(source);
  const to = canonicalTarget(destination);
  if (within(from, to) || within(to, from) || to === path.parse(to).root)
    throw new Error('Upload source and destination must be separate non-root folders.');
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
      const current = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Review symbolic links before copying upload storage.');
      if (entry.isDirectory()) walk(current);
      else if (entry.isFile()) {
        const target = path.join(to, path.relative(from, current));
        if (!within(to, canonicalTarget(target))) throw new Error('Destination link leaves the selected folder.');
        const checksum = hash(current);
        if (fs.existsSync(target) && hash(target) !== checksum)
          throw new Error(`Destination already contains different content: ${path.relative(from,current)}`);
        files.push({source:current,target,sha256:checksum,bytes:fs.statSync(current).size});
      } else throw new Error('Unsupported upload storage entry.');
    }
  };
  walk(from);
  return {source:from,destination:to,files};
}
function applyCopy(plan) {
  fs.mkdirSync(plan.destination,{recursive:true,mode:0o750});
  for (const file of plan.files) {
    fs.mkdirSync(path.dirname(file.target),{recursive:true,mode:0o750});
    if (!fs.existsSync(file.target)) fs.copyFileSync(file.source,file.target,fs.constants.COPYFILE_EXCL);
    if (hash(file.source) !== file.sha256 || hash(file.target) !== file.sha256)
      throw new Error('Upload copy checksum changed. Do not switch storage configuration.');
  }
}
function main() {
  const root = fs.realpathSync(path.resolve(__dirname,'../..'));
  const destination = process.argv[2];
  if (!destination) throw new Error('Specify an external destination; default operation is dry-run.');
  const target = canonicalTarget(destination);
  if (within(root,target) || within(target,root) || target === path.parse(target).root)
    throw new Error('Select a separate external application-data folder.');
  const plans = [
    planCopy(path.join(root,'server/private_uploads'),path.join(target,'private_uploads')),
    planCopy(path.join(root,'server/uploads'),path.join(target,'legacy_uploads')),
  ];
  const apply = process.argv.includes('--apply');
  if (apply && process.env.CIMS_UPLOAD_WRITES_STOPPED !== 'true')
    throw new Error('Stop CIMS upload writers and set CIMS_UPLOAD_WRITES_STOPPED=true before applying.');
  if (apply) {
    for (const plan of plans) applyCopy(plan);
    fs.mkdirSync(path.join(target,'file_backups'),{recursive:true,mode:0o750});
    const audit=path.join(root,'.runtime/backups');
    fs.mkdirSync(audit,{recursive:true});
    fs.writeFileSync(path.join(audit,`external-storage-${Date.now()}.json`),JSON.stringify({createdAt:new Date().toISOString(),plans,originalsRetained:true,databaseChanged:false},null,2));
  }
  console.log(JSON.stringify({apply,target,files:plans.reduce((n,p)=>n+p.files.length,0),bytes:plans.reduce((n,p)=>n+p.files.reduce((sum,f)=>sum+f.bytes,0),0),originalsRetained:true,databaseChanged:false},null,2));
}
module.exports={planCopy,applyCopy,canonicalTarget,within};
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
