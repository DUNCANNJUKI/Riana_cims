const release = 'scheduling-20261016-4';
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
        changed=(await registration.unregister()) || changed;
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
