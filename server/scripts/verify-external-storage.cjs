const path=require('node:path');
const fs=require('node:fs');
require('dotenv').config({path:path.join(__dirname,'../../.env.local')});
const app=path.resolve(__dirname,'../..');
const outside=(input)=>{
  if(!input)return false;
  const resolved=path.resolve(input);const actual=fs.existsSync(resolved)?fs.realpathSync(resolved):resolved;
  const relative=path.relative(app,actual);
  return relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative);
};
const privateRoot=process.env.PRIVATE_UPLOAD_ROOT;
const legacyRoot=process.env.LEGACY_UPLOAD_ROOT || (privateRoot?path.join(privateRoot,'legacy'):undefined);
console.log(JSON.stringify({applicationRoot:app,privateUploadRoot:privateRoot || 'NOT CONFIGURED',legacyUploadRoot:legacyRoot || 'NOT CONFIGURED',privateOutsideApplication:outside(privateRoot),legacyOutsideApplication:outside(legacyRoot)},null,2));
if(!outside(privateRoot) || !outside(legacyRoot))process.exitCode=1;
