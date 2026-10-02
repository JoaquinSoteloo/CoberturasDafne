'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const current=()=>document.documentElement.dataset.theme||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');

export function ThemeToggle({className=''}:{className?:string}){
  const [theme,setTheme]=useState<string|null>(null);
  useEffect(()=>setTheme(current()),[]);
  const toggle=()=>{const next=current()==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('dafne-theme',next)}catch{}setTheme(next)};
  const dark=theme==='dark';
  return <button type="button" className={`theme-toggle ${className}`} onClick={toggle} aria-pressed={dark} aria-label="Modo noche">{dark?<Sun size={18}/>:<Moon size={18}/>}<span>{dark?'Modo día':'Modo noche'}</span></button>;
}
