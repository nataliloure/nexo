import {useEffect,useMemo,useRef,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {supabase} from './supabase'
import './engagement.css'

type Row={id:string;record_type:string;created_at:string}

const labels:Record<string,string>={
  checkin:'Check-in',relation:'Relação',reflection:'Reflexão',experiment:'Experimento',value:'Valores',review:'Revisão'
}
const stages=[
  {icon:'🌱',title:'Semente',text:'Comece com um registro que realmente ajude você a se observar.'},
  {icon:'🌿',title:'Broto',text:'Uma presença registrada. Pequeno e suficiente para começar.'},
  {icon:'🍃',title:'Folhas',text:'Você trouxe mais de uma perspectiva para o seu dia.'},
  {icon:'🌼',title:'Floresceu',text:'Seu ciclo de cuidado de hoje já está completo.'},
  {icon:'🌻',title:'Jardim',text:'Há variedade nos seus registros, sem necessidade de preencher mais.'},
  {icon:'🌳',title:'Raízes',text:'Um dia rico em observação. Agora também vale deixar a experiência acontecer.'},
]

function localKey(date:Date){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0')
  return `${y}-${m}-${d}`
}

export default function Engagement(){
  const[session,setSession]=useState<Session|null>(null)
  const[rows,setRows]=useState<Row[]>([])
  const[collapsed,setCollapsed]=useState(false)
  const[bloom,setBloom]=useState(0)
  const initialized=useRef(false)
  const lastCount=useRef(0)

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s))
    return()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!session){setRows([]);initialized.current=false;lastCount.current=0;return}
    let live=true
    let bloomTimer:number|undefined
    const load=async()=>{
      if(document.hidden)return
      const{data,error}=await supabase.from('nexo_records').select('id,record_type,created_at').order('created_at',{ascending:true})
      if(error||!live)return
      const next=(data||[]) as Row[]
      if(initialized.current&&next.length>lastCount.current){
        setBloom(x=>x+1)
        window.clearTimeout(bloomTimer)
        bloomTimer=window.setTimeout(()=>setBloom(0),2600)
      }
      initialized.current=true
      lastCount.current=next.length
      setRows(next)
    }
    load()
    const id=window.setInterval(load,4000)
    window.addEventListener('focus',load)
    return()=>{live=false;window.clearInterval(id);window.clearTimeout(bloomTimer);window.removeEventListener('focus',load)}
  },[session?.user.id])

  const stats=useMemo(()=>{
    const today=localKey(new Date())
    const month=today.slice(0,7)
    const todayRows=rows.filter(r=>localKey(new Date(r.created_at))===today)
    const unique=[...new Set(todayRows.map(r=>r.record_type))]
    const monthDays=new Set(rows.filter(r=>localKey(new Date(r.created_at)).startsWith(month)).map(r=>localKey(new Date(r.created_at))))
    const level=Math.min(unique.length,5)
    const goal=Math.min(unique.length,3)
    return{todayRows,unique,activeDays:monthDays.size,level,goal,pct:goal/3*100}
  },[rows])

  if(!session)return null
  const stage=stages[stats.level]
  const enough=stats.goal>=3

  return <>
    {bloom>0&&<div className="nexo-bloom" key={bloom} role="status" aria-live="polite">
      <div className="nexo-bloom-orb">✨</div>
      <strong>Registro salvo</strong>
      <span>Seu jardim ganhou um novo detalhe.</span>
      <div className="nexo-petals" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} style={{'--i':i} as React.CSSProperties}>✦</i>)}</div>
    </div>}

    <section className={`nexo-garden ${collapsed?'is-collapsed':''}`} aria-label="Recompensas de presença">
      <button className="garden-toggle" onClick={()=>setCollapsed(x=>!x)} aria-label={collapsed?'Abrir jardim do dia':'Recolher jardim do dia'}>
        <span>{stage.icon}</span><b>{collapsed?`${stats.goal}/3`:'×'}</b>
      </button>
      {!collapsed&&<>
        <div className="garden-head">
          <div><small>JARDIM DO DIA</small><h3>{stage.icon} {stage.title}</h3></div>
          <div className="presence-pill">{stats.activeDays} {stats.activeDays===1?'dia':'dias'} neste mês</div>
        </div>
        <p>{stage.text}</p>
        <div className="garden-progress" aria-label={`${stats.goal} de 3 passos de cuidado`}>
          <span style={{width:`${stats.pct}%`}}/>
        </div>
        <div className="garden-dots" aria-hidden="true">{[1,2,3].map(n=><i key={n} className={stats.goal>=n?'done':''}>{stats.goal>=n?'✦':'·'}</i>)}</div>
        <div className="garden-tags">
          {Object.entries(labels).map(([key,label])=><span key={key} className={stats.unique.includes(key)?'done':''}>{stats.unique.includes(key)?'✓ ':''}{label}</span>)}
        </div>
        <div className={`garden-message ${enough?'enough':''}`}>
          {enough?<><b>Você já fez o suficiente por hoje.</b><span>Se algo novo realmente acontecer, registre. Caso contrário, pode fechar o Nexo sem perder progresso.</span></>:<><b>{3-stats.goal} {3-stats.goal===1?'passo significativo':'passos significativos'} para florescer.</b><span>Variedade conta mais do que quantidade. Repetir o mesmo formulário não acelera o jardim.</span></>}
        </div>
      </>}
    </section>
  </>
}
