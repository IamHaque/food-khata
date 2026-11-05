import {useEffect,useState} from 'react';
export function ThemeControl(){
 const [theme,setTheme]=useState(()=>{try{return localStorage.getItem('food-khata-v2-theme')??'system';}catch{return 'system';}});
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.v2theme=theme==='system'?(media.matches?'dark':'light'):theme;};apply();media.addEventListener('change',apply);try{localStorage.setItem('food-khata-v2-theme',theme);}catch{/* Theme remains usable without storage. */}return()=>media.removeEventListener('change',apply);},[theme]);
 return <label>Theme<select aria-label="Theme" value={theme} onChange={e=>setTheme(e.target.value)}>{['light','dark','system'].map(v=><option key={v}>{v}</option>)}</select></label>;
}

