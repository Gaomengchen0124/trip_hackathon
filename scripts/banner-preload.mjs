// Runs in the HTML head, before the application bundle discovers the masthead.
export function bannerPreloadScript(banners, base) {
  return `(function(){
    var base=${JSON.stringify(base)}, banners=${JSON.stringify(banners)};
    var home=new URL(base,location.href).pathname;
    if(location.pathname!==home)return;
    var image=banners[matchMedia('(max-width: 600px)').matches?'skyMobile':'sky'];
    if(!image)return;
    var link=document.createElement('link');
    link.rel='preload';link.as='image';link.type='image/webp';link.fetchPriority='high';
    link.href=base+image.variants[image.variants.length-1].src;
    link.imageSrcset=image.variants.map(function(v){return base+v.src+' '+v.width+'w'}).join(', ');
    link.imageSizes='100vw';document.head.appendChild(link);
  })();`
}
