const test=require('node:test');const assert=require('node:assert/strict');const {schedulingReferenceBoundary}=require('./schedulingReferences');
test('scheduling references block dependent deletes without probing unauthorized resources',async()=>{
  const previous=process.env.SCHEDULING_ENABLED;process.env.SCHEDULING_ENABLED='true';
  try{
    let queries=0,next=0,status=0;
    const middleware=schedulingReferenceBoundary({query:async()=>{queries++;return [[{id:'event'}]];}});
    const res={status(value){status=value;return this;},json(){return this;}};
    await middleware({method:'DELETE',path:'/user_profiles/tech',user:{id:'admin',role:'SuperAdmin'}},res,()=>next++);
    assert.equal(status,409);assert.equal(queries,1);
    await middleware({method:'DELETE',path:'/user_profiles/tech',user:{id:'tech',role:'User'}},res,()=>next++);
    assert.equal(queries,1);assert.equal(next,1);
    const scoped=schedulingReferenceBoundary({query:async()=>[[]]});
    await scoped({method:'DELETE',path:'/user_profiles/foreign',user:{id:'admin',role:'Admin',subsidiary_id:'a'}},res,()=>next++);
    assert.equal(status,404);assert.equal(next,1);
  }finally{if(previous===undefined)delete process.env.SCHEDULING_ENABLED;else process.env.SCHEDULING_ENABLED=previous;}
});
