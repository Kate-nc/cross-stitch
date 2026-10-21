// Diagnostic scope and hook-expression comparison. Usage: node reports/cleanup-10/binding-audit.cjs
const fs=require('fs'),cp=require('child_process'),babel=require('@babel/core'),assert=require('node:assert/strict');
const base=cp.execFileSync('git',['show','74e506ce:tracker-app.js'],{encoding:'utf8'});
const head=fs.readFileSync('tracker-app.js','utf8');
function inspect(source){
  const out={bindings:{},hooks:[],dynamic:[]};
  babel.transformSync(source,{configFile:false,babelrc:false,code:false,parserOpts:{plugins:['jsx']},plugins:[()=>({visitor:{
    FunctionDeclaration(p){if(p.node.id?.name!=='TrackerApp')return;
      for(const name of ['allParkLayersHidden','setAllParkLayersVisible','toggleParkLayer']){
        const b=p.scope.getBinding(name);out.bindings[name]=b?{references:b.referencePaths.length,writes:b.constantViolations.length}:null;
      }
      p.traverse({CallExpression(c){const n=c.node.callee;
        if(n.type==='Identifier'&&/^use[A-Z]/.test(n.name))out.hooks.push(babel.transformFromAstSync({type:'File',program:{type:'Program',sourceType:'script',body:[{type:'ExpressionStatement',expression:c.node}]}},null,{configFile:false,babelrc:false,compact:true}).code);
        if(n.name==='eval'||n.name==='Function')out.dynamic.push(n.name);
      }});
    }
  }})]});return out;
}
const before=inspect(base),after=inspect(head);
assert.deepEqual(after.hooks,before.hooks);
for(const name of ['allParkLayersHidden','setAllParkLayersVisible']){
  assert.deepEqual(before.bindings[name],{references:0,writes:0});assert.equal(after.bindings[name],null);
}
assert.equal(after.bindings.toggleParkLayer.references,before.bindings.toggleParkLayer.references);
assert.deepEqual(before.dynamic,[]);assert.deepEqual(after.dynamic,[]);
console.log(JSON.stringify({base:'74e506ce',before:before.bindings,after:after.bindings,unchangedHookExpressions:after.hooks.length,directDynamicEvaluation:after.dynamic},null,2));
