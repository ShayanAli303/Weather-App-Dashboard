const OWM_API_KEY = 'c47778fc291971f5c134f70b2d53bded';
const globeCanvas = document.getElementById('globeCanvas');
const searchBtn = document.getElementById('searchBtn');
const locBtn = document.getElementById('locBtn');
const cityInput = document.getElementById('cityInput');
const suggestionsEl = document.getElementById('suggestions');
const loadingOverlay = document.getElementById('loadingOverlay');
const mapPane = document.getElementById('mapPane');
const globePane = document.getElementById('globePane');
const backBtn = document.getElementById('backBtn');
const weatherPanel = document.getElementById('weatherPanel');
const wCity = document.getElementById('w-city');
const wNow = document.getElementById('w-now');
const wDetails = document.getElementById('w-details');
const wForecast = document.getElementById('w-forecast');
const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;

let scene, camera, renderer, earthMesh, animId, rotating = true;
let map, marker;

function initGlobe(){
  scene = new THREE.Scene();
  const fov = 40;
  const aspect = globeCanvas.clientWidth / globeCanvas.clientHeight;
  camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
  camera.position.set(0,0,3.2);
  renderer = new THREE.WebGLRenderer({canvas:globeCanvas,antialias:true,alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(globeCanvas.clientWidth, globeCanvas.clientHeight, false);
  const light = new THREE.DirectionalLight(0xffffff,0.9);light.position.set(5,3,5);scene.add(light);
  const amb = new THREE.AmbientLight(0xffffff,0.4);scene.add(amb);
  const geometry = new THREE.SphereGeometry(1,64,64);
  const loader = new THREE.TextureLoader();
  const tex = loader.load('https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg',()=>{renderer.render(scene,camera)});
  const material = new THREE.MeshStandardMaterial({map:tex,roughness:1,metalness:0});
  earthMesh = new THREE.Mesh(geometry,material);
  scene.add(earthMesh);
  animateGlobe();
  window.addEventListener('resize',onResize);
}
function onResize(){renderer.setSize(globeCanvas.clientWidth,globeCanvas.clientHeight);camera.aspect = globeCanvas.clientWidth / globeCanvas.clientHeight;camera.updateProjectionMatrix()}
function animateGlobe(){
  animId = requestAnimationFrame(animateGlobe);
  if(rotating) earthMesh.rotation.y += 0.0025;
  renderer.render(scene,camera);
}
function zoomGlobeTo(lat,lon,done){
  rotating=false;
  const phi = (90 - lat) * (Math.PI/180);
  const theta = (lon + 180) * (Math.PI/180);
  const x = Math.sin(phi) * Math.cos(theta);
  const z = Math.sin(phi) * Math.sin(theta);
  const y = Math.cos(phi);
  const target = new THREE.Vector3(x,y,z).multiplyScalar(1.6);
  gsap.to(camera.position,{duration:0.9,x:target.x,y:target.y,z:target.z,ease:"power2.inOut"});
  gsap.to(earthMesh.rotation,{duration:0.9,y: -theta + Math.PI/2, x:0.0, ease:"power2.inOut",onComplete:() => { if(done) done(); }});
}
function resetGlobeView(){
  gsap.to(camera.position,{duration:0.9,x:0,y:0,z:3.2,ease:"power2.inOut",onComplete:()=>{rotating=true}});
  gsap.to(earthMesh.rotation,{duration:0.9,x:0,y:0,ease:"power2.inOut"});
}

function showLoading(seconds=1200){
  loadingOverlay.classList.remove('hidden');
  return new Promise(res=>setTimeout(()=>{loadingOverlay.classList.add('hidden');res();},seconds));
}

async function geocodeCity(q){
  if(!q) return [];
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=6&appid=${OWM_API_KEY}`;
  const r = await fetch(url);
  if(!r.ok) return [];
  return r.json();
}

let selectedPlace = null;
cityInput.addEventListener('input', async e => {
  const v = e.target.value.trim();
  suggestionsEl.innerHTML = '';
  if(!v){suggestionsEl.style.display='none';return}
  const list = await geocodeCity(v);
  if(!list || !list.length){suggestionsEl.style.display='none';return}
  suggestionsEl.style.display='block';
  list.forEach(item=>{
    const name = `${item.name}${item.state?(', '+item.state):''}, ${item.country}`;
    const div = document.createElement('div');
    div.className='item';
    div.textContent = name;
    div.addEventListener('click', ()=> {
      cityInput.value = name;
      selectedPlace = item;
      suggestionsEl.style.display='none';
    });
    suggestionsEl.appendChild(div);
  });
});

async function fetchWeather(lat,lon){
  const wcur = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_API_KEY}`);
  if(!wcur.ok) throw new Error('weather fail');
  const cur = await wcur.json();
  const f = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_API_KEY}`);
  const forecast = f.ok ? await f.json() : null;
  return {cur,forecast};
}
function pickThreeDays(list){
  const map = {};
  list.forEach(it=>{
    const d = new Date(it.dt*1000).toISOString().slice(0,10);
    const hour = new Date(it.dt*1000).getUTCHours();
    if(!map[d] || Math.abs(hour-12) < Math.abs(map[d].hour-12)) map[d] = {hour,item:it};
  });
  const arr = Object.values(map).map(i=>i.item);
  return arr.slice(1,4).map(i=>({
    day:new Date(i.dt*1000).toLocaleDateString(undefined,{weekday:'short'}),
    temp:Math.round(i.main.temp),
    icon:i.weather[0].main,
    desc:i.weather[0].description
  }));
}

function weatherEmoji(condition){
  condition = condition.toLowerCase();
  if(condition.includes('rain')) return '🌧️';
  if(condition.includes('cloud')) return '☁️';
  if(condition.includes('clear')) return '☀️';
  if(condition.includes('snow')) return '❄️';
  if(condition.includes('storm') || condition.includes('thunder')) return '⛈️';
  if(condition.includes('mist') || condition.includes('fog') || condition.includes('haze')) return '🌫️';
  return '🌍';
}

function showMapAndWeather(place){
  globePane.setAttribute('aria-hidden','true');
  mapPane.setAttribute('aria-hidden','false');
  backBtn.style.display = 'block';
  const lat = place.lat, lon = place.lon;
  if(!map){
    map = L.map('map',{zoomControl:false,attributionControl:false}).setView([lat,lon],6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  } else {
    map.setView([lat,lon],10, {animate:true});
  }
  if(marker) marker.remove();
  marker = L.marker([lat,lon]).addTo(map);
  fetchWeather(lat,lon).then(({cur,forecast})=>{
    const curIcon = weatherEmoji(cur.weather[0].main);
    wCity.textContent = `${cur.name}, ${cur.sys.country}`;
    wNow.innerHTML = `${Math.round(cur.main.temp)}°C ${curIcon} • ${cur.weather[0].description}`;
    wDetails.innerHTML = `Feels like ${Math.round(cur.main.feels_like)}° · Hum ${cur.main.humidity}% · Wind ${Math.round(cur.wind.speed)} m/s`;
    wForecast.innerHTML = '';
    if(forecast && forecast.list) {
      const three = pickThreeDays(forecast.list);
      three.forEach(d=>{
        const el = document.createElement('div');
        el.className = 'fday';
        el.innerHTML = `<div style="font-weight:700">${d.day}</div><div style="margin-top:6px">${d.temp}° ${weatherEmoji(d.icon)}</div><div style="margin-top:4px; font-size:14px; opacity:0.85">${d.desc}</div>`;
        wForecast.appendChild(el);
      });
    }
    setTimeout(()=>weatherPanel.classList.add('show'),120);
  }).catch(()=>{wCity.textContent='Weather unavailable';wNow.textContent='—';wDetails.textContent='—';wForecast.innerHTML=''});
}

searchBtn.addEventListener('click', async () => {
  const q = cityInput.value.trim();
  let place = selectedPlace;
  if(!place){
    const list = await geocodeCity(q);
    place = (list && list[0]) ? list[0] : null;
  }
  if(!place) return;
  await showLoading(1200);
  zoomGlobeTo(place.lat, place.lon, ()=> {
    showMapAndWeather(place);
  });
});

locBtn.addEventListener('click', () => {
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const geo = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OWM_API_KEY}`);
    const arr = await geo.json();
    const place = (arr && arr[0]) ? arr[0] : {name:'Current Location',lat,lon,country:''};
    await showLoading(1000);
    zoomGlobeTo(place.lat, place.lon, ()=> {
      showMapAndWeather({lat:place.lat,lon:place.lon,name:place.name,country:place.country});
    });
  }, err=>{});
});

backBtn.addEventListener('click', ()=> {
  weatherPanel.classList.remove('show');
  mapPane.setAttribute('aria-hidden','true');
  globePane.setAttribute('aria-hidden','false');
  backBtn.style.display = 'none';
  resetGlobeView();
});

themeToggle.addEventListener('click', ()=> {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  themeToggle.textContent = isLight ? '☀️' : '🌙';
  loadParticles(isLight ? 'light' : 'dark');
});

function initParticles(){
  const ctx = document.createElement('canvas');
  ctx.id = 'partCanvas';
  ctx.style.position='absolute';
  ctx.style.inset='0';
  ctx.style.zIndex='0';
  document.getElementById('particlesLite').appendChild(ctx);
  const canvas = ctx;
  const c = canvas.getContext('2d');
  function resize(){canvas.width=canvas.offsetWidth;canvas.height=canvas.offsetHeight}
  resize(); window.addEventListener('resize',resize);
  const particles = [];
  for(let i=0;i<80;i++){particles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.8+0.6,vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.6,alpha:0.5+Math.random()*0.5})}
  function draw(){
    c.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy;
      if(p.x<0) p.x=canvas.width; if(p.x>canvas.width) p.x=0;
      if(p.y<0) p.y=canvas.height; if(p.y>canvas.height) p.y=0;
      c.beginPath(); c.fillStyle = `rgba(38,214,255,${p.alpha})`; c.arc(p.x,p.y,p.r,0,Math.PI*2); c.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}
function loadParticles(theme){ const el = document.getElementById('partCanvas'); if(!el){initParticles();return} el.style.filter = theme === 'light' ? 'brightness(.6) hue-rotate(180deg)' : 'none' }

initGlobe();
initParticles();
loadParticles(document.body.classList.contains('light') ? 'light' : 'dark');
