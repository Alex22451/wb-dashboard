// CommonJS test harness loads the TypeScript config in an isolated fixture context.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript');
const source=fs.readFileSync('src/lib/entrepreneurs-config.ts','utf8');
function load(env,file){const exports={}; const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{exports,process:{env,cwd:()=>'/fixture'},console,require:(m)=>m==='fs'?{existsSync:()=>true,readFileSync:()=>JSON.stringify({entrepreneurs:file})}:require(m)});return exports.getEntrepreneurs();}
const old={id:1,name:'Existing',apiKey:'fixture-existing'};
const elmira={id:8,name:'Эльмира',apiKey:'',apiKeyEnv:'WB_API_KEY_ELMIRA'};
for(const env of [{WB_API_KEY_ELMIRA:'fixture-elmira'},{WB_API_KEY_ELMIRA:'fixture-elmira',ENTREPRENEURS:JSON.stringify([{id:1,name:'Existing',apiKey:'fixture-old-env'}])}]){
 const result=load(env,[old,elmira]);assert.equal(result.length,2);assert.equal(result[0].apiKey,'fixture-existing');assert.equal(result[1].apiKey,'fixture-elmira');
}
assert.equal(load({},[elmira])[0].apiKey,'');
assert.equal(load({WB_API_KEY_ELMIRA:'fixture-env'},[{...elmira,apiKey:'fixture-explicit'}])[0].apiKey,'fixture-explicit');
const actual=JSON.parse(fs.readFileSync('entrepreneurs.json')).entrepreneurs;
assert.equal(new Set(actual.map(x=>x.id)).size,actual.length);
console.log('PASS: independent secret loaded with/without existing env, existing seller preserved, missing secret empty, explicit key priority, unique IDs');

assert.equal(load({WB_API_KEY_ELMIRA:'   '},[elmira])[0].apiKey,'');
assert.equal(load({DATABASE_URL:'fixture-sensitive'},[{...elmira,apiKeyEnv:'DATABASE_URL'}])[0].apiKey,'');
assert.equal(load({},[{id:2,name:'Боев Ф.В.',apiKey:'fixture-removed'}]).length,0);
assert.equal(actual.find(x=>x.id===8).apiKeyEnv,'WB_API_KEY_ELMIRA');
assert.equal(actual.find(x=>x.id===8).apiKey,'');
console.log('PASS: whitespace and unrelated environment variables ignored; removed seller stays excluded; Elmira config points to secret');
