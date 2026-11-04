// Bounded background audit; exits nonzero on a failed request.
// Run with: node worker.js rapport
const {analyse}=require('./check.js');
async function run(){
 if(process.argv[2]!=='rapport')throw Error('Brug: node worker.js rapport');
 const sites=(process.env.SITES||process.env.SITE_URL||'https://maryjuul-ai-synlighed.onrender.com').split(',').map(s=>s.trim()).filter(Boolean).slice(0,20);
 let errors=0;
 for(const site of sites){
  try{const result=await analyse(site);console.log(JSON.stringify({type:'website_audit',...result}));}
  catch(error){errors++;console.error(JSON.stringify({type:'website_audit_error',site,error:error.message}));}
 }
 if(errors)process.exitCode=1;
}
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={run};
