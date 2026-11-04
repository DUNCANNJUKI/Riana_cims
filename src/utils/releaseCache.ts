const release = 'production-recovery-20261104-1';
const versionKey = 'riana-app-cache-release';

export async function clearReleaseCaches() {
  if(localStorage.getItem(versionKey)===release)return false;
  let changed=false;
  if('caches' in window){
    const names=await caches.keys();
    const stale=names.filter((name)=>name.startsWith('riana-') || name.startsWith('workbox-precache'));
    await Promise.all(stale.map((name)=>caches.delete(name)));
    changed=stale.length>0;
  }
  if('serviceWorker' in navigator){
    const registrations=await navigator.serviceWorker.getRegistrations();
    for(const registration of registrations){
      const scope=new URL(registration.scope);
      if(scope.origin===location.origin && ['/', '/developers/'].includes(scope.pathname)){
        // Request the matching release without unregistering the worker or
        // deleting user-managed browser storage. Workbox activates the updated
        // precache through its normal lifecycle.
        await registration.update();
      }
    }
  }
  localStorage.setItem(versionKey,release);
  return changed;
}
export function refreshReleaseCaches(){
  window.addEventListener('load',()=>{
    void clearReleaseCaches().then((changed)=>{if(changed)location.reload();}).catch(()=>undefined);
  },{once:true});
}
