import {useEffect,useMemo,useState} from 'react'
import {supabase} from './supabase'

type Rec={id:string;created_at:string;record_type:string;payload:any}
type Period='30'|'90'|'all'

const STOPWORDS=new Set(`a à agora ainda algo algum alguma algumas alguns ali as até ao aos aquela aquelas aquele aqueles aquilo com como contra da das de dela delas dele deles depois do dos e é ela elas ele eles em entre era eram essa essas esse esses esta estão estar estas estava estavam este estes eu foi foram há isso isto já lhe lhes mais mas me mesmo meu meus minha minhas muito na nas nem no nos nós nossa nossas nosso nossos num numa o os ou para pela pelas pelo pelos por porque qual quando que quem se sem ser seu seus sua suas só também te tem tendo ter teu teus tua tuas um uma umas uns você vocês hoje ontem amanhã aqui ali então muito pouco cada onde`.split(/\s+/))
const FIELDS:Record<string,string[]>= {
  checkin:['event','notes'],
  relation:['context','observed','inferred','assumption','alternatives'],
  experiment:['situation','prediction','anticipatedEmotion','actual','observedEmotion','learning'],
  value:['value','behavior','action'],
  reflection:['thought','action'],
}
const LABELS:Record<string,string>={all:'Todos',checkin:'Check-ins',relation:'Relações',experiment:'Experimentos',value:'Valores',reflection:'Reflexões',review:'Revisões'}

function textsFromRecord(r:Rec){
  if(r.record_type==='review') return Object.values(r.payload?.answers||{}).filter(v=>typeof v==='string') as string[]
  return (FIELDS[r.record_type]||[]).map(k=>r.payload?.[k]).filter(v=>typeof v==='string'&&v.trim())
}
function tokens(text:string){
  return (text.toLocaleLowerCase('pt-BR').match(/[\p{L}][\p{L}'’-]*/gu)||[])
    .map(w=>w.replace(/^['’-]+|['’-]+$/g,''))
    .filter(w=>w.length>=3&&!STOPWORDS.has(w))
}

export default function WordCloud(){
  const[records,setRecords]=useState<Rec[]>([])
  const[loading,setLoading]=useState(true)
  const[period,setPeriod]=useState<Period>('90')
  const[type,setType]=useState('all')
  const[minFreq,setMinFreq]=useState(2)
  const[maxWords,setMaxWords]=useState(60)
  const[exclude,setExclude]=useState('')

  useEffect(()=>{(async()=>{setLoading(true);const{data,error}=await supabase.from('nexo_records').select('id,record_type,payload,created_at').order('created_at',{ascending:true});if(error){console.error(error);setLoading(false);return}setRecords((data||[]) as Rec[]);setLoading(false)})()},[])

  const analysis=useMemo(()=>{
    const cutoff=period==='all'?0:Date.now()-Number(period)*86400000
    const custom=new Set(tokens(exclude))
    const selected=records.filter(r=>r.payload?.subtype!=='wearable_daily'&&(type==='all'||r.record_type===type)&&new Date(r.created_at).getTime()>=cutoff)
    const texts=selected.flatMap(textsFromRecord)
    const counts=new Map<string,number>()
    texts.flatMap(tokens).forEach(w=>{if(!custom.has(w))counts.set(w,(counts.get(w)||0)+1)})
    const words=[...counts.entries()].map(([word,count])=>({word,count})).filter(x=>x.count>=minFreq).sort((a,b)=>b.count-a.count||a.word.localeCompare(b.word,'pt-BR')).slice(0,maxWords)
    const max=words[0]?.count||1,min=words.at(-1)?.count||1
    return{words,max,min,textCount:texts.length,recordCount:selected.length,totalTokens:[...counts.values()].reduce((a,b)=>a+b,0)}
  },[records,period,type,minFreq,maxWords,exclude])

  if(loading)return <p>Carregando suas respostas qualitativas...</p>
  return <>
    <div className="eyebrow">análise textual pessoal</div><h1>Nuvem de palavras</h1>
    <p>Visualização descritiva das palavras mais frequentes nas suas respostas abertas. O processamento ocorre no navegador após carregar apenas os registros autorizados da sua conta.</p>
    <div className="card word-controls">
      <label>Período<select value={period} onChange={e=>setPeriod(e.target.value as Period)}><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todo o histórico</option></select></label>
      <label>Origem<select value={type} onChange={e=>setType(e.target.value)}>{Object.entries(LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Frequência mínima<select value={minFreq} onChange={e=>setMinFreq(+e.target.value)}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <label>Máximo de palavras<select value={maxWords} onChange={e=>setMaxWords(+e.target.value)}>{[30,60,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
    </div>
    <div className="card form"><label>Palavras adicionais para ignorar<input value={exclude} onChange={e=>setExclude(e.target.value)} placeholder="ex.: trabalho reunião projeto"/></label></div>
    <div className="grid"><div className="card"><b>{analysis.recordCount}</b><small> registros no filtro</small></div><div className="card"><b>{analysis.textCount}</b><small> respostas abertas</small></div><div className="card"><b>{analysis.totalTokens}</b><small> palavras analisadas</small></div></div>
    <div className="card word-cloud" aria-label="Nuvem de palavras">
      {analysis.words.length?analysis.words.map(({word,count},i)=>{const span=analysis.max-analysis.min;const size=span?18+(count-analysis.min)/span*42:30;return <span key={word} className={`cloud-word cloud-tone-${i%5}`} style={{fontSize:`${size}px`,fontWeight:500+Math.round((size-18)/42*250)}} title={`${word}: ${count} ocorrências`}>{word}<sup>{count}</sup></span>}):<p>Ainda não há palavras suficientes para os filtros escolhidos.</p>}
    </div>
    {analysis.words.length>0&&<div className="card"><h3>Palavras mais frequentes</h3><div className="word-ranking">{analysis.words.slice(0,15).map((x,i)=><div key={x.word}><span>{i+1}. {x.word}</span><b>{x.count}</b></div>)}</div></div>}
    <p className="method-note">A frequência de palavras não mede importância psicológica, sentimento ou causalidade. Termos iguais em contextos diferentes são agrupados apenas pela forma textual.</p>
  </>
}
