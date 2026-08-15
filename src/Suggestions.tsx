import {useEffect,useMemo,useState} from 'react'
import {supabase} from './supabase'

type Domain='Autorregulação'|'Flexibilidade'|'Socioemocional'|'Relações'|'Metacognição'
type Checkin={id:string;created_at:string;payload:any}

const DOMAIN_IDS:Record<Domain,string[]>={
  'Autorregulação':['ar1','ar2','ar3'],
  'Flexibilidade':['fx1','fx2','fx3'],
  'Socioemocional':['se1','se2','se3'],
  'Relações':['re1','re2','re3'],
  'Metacognição':['mc1','mc2','mc3'],
}
const DOMAINS=Object.keys(DOMAIN_IDS) as Domain[]
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:NaN
const score=(c:Checkin,d:Domain)=>mean(DOMAIN_IDS[d].map(id=>Number(c.payload?.responses?.[id])).filter(Number.isFinite))

const guidance:Record<Domain,{approach:string;practice:string;schema:string;evidence:string[]}>= {
  'Autorregulação':{
    approach:'Ativação comportamental',
    practice:'Escolha uma ação pequena, observável e realizável hoje, de preferência ligada a algo relevante ou potencialmente recompensador. Defina quando e onde fará e, depois, registre se a ação mudou energia, envolvimento ou sensação de progresso.',
    schema:'Se a dificuldade de iniciar se repete em contextos parecidos, trate a ideia de “esquema” apenas como hipótese: que expectativa antiga parece ter sido ativada e qual resposta mais funcional você gostaria de praticar agora?',
    evidence:['BA-2026','ST-PD-2014'],
  },
  'Flexibilidade':{
    approach:'Terapia de Aceitação e Compromisso (ACT)',
    practice:'Nomeie o pensamento ou emoção presente, diferencie a experiência interna da ação que você escolherá e selecione uma ação pequena coerente com um valor, sem exigir que o desconforto desapareça primeiro.',
    schema:'Se houver uma narrativa recorrente sobre si ou sobre os outros, registre-a como hipótese de padrão, não como verdade. Pergunte qual comportamento seria compatível com seus valores mesmo se essa narrativa continuar presente.',
    evidence:['ACT-2025','ST-BPD-2022'],
  },
  'Socioemocional':{
    approach:'Intervenções de regulação emocional',
    practice:'Antes de reagir, identifique a emoção, a intensidade e o que a situação permite controlar. Em seguida escolha conscientemente entre aceitar a experiência, reinterpretar a situação ou resolver um problema concreto, em vez de responder no piloto automático.',
    schema:'Observe se a emoção veio acompanhada de uma expectativa muito rígida sobre rejeição, fracasso, abandono, desconfiança ou exigência. Use isso apenas como pista para reflexão, sem rotular um esquema automaticamente.',
    evidence:['ER-2024','ST-PD-2014'],
  },
  'Relações':{
    approach:'Psicoterapia interpessoal + lente de terapia do esquema',
    practice:'Escolha uma interação recente. Separe fatos observáveis, interpretação e necessidade. Depois formule uma ação relacional específica, como pedir esclarecimento, expressar um limite ou testar uma interpretação antes de assumir a intenção da outra pessoa.',
    schema:'Pergunte se você está repetindo uma expectativa relacional conhecida. Em terapia do esquema, padrões e modos são trabalhados no contexto clínico; aqui eles servem apenas como hipótese para levar à reflexão ou à psicoterapia.',
    evidence:['IPT-2023','ST-PD-2014','ST-BPD-2022'],
  },
  'Metacognição':{
    approach:'Terapia metacognitiva (MCT)',
    practice:'Observe o processo de pensar, não apenas o conteúdo. Pergunte se a análise atual está produzindo uma decisão nova ou apenas repetindo preocupação/ruminação. Se estiver repetitiva, redirecione deliberadamente a atenção para uma tarefa concreta e volte ao tema apenas quando houver algo novo a decidir.',
    schema:'Se a mesma conclusão sobre si reaparece de forma automática, registre o contexto, a conclusão e uma alternativa. Isso não confirma um esquema; serve para identificar padrões que podem ser discutidos em psicoterapia.',
    evidence:['MCT-2024','ST-PD-2014'],
  },
}

const evidence:{id:string;design:string;title:string;finding:string;scope:string;doi?:string;pmid?:string}[]=[
  {id:'BA-2026',design:'Meta-análise de ensaios randomizados',title:'Behavioral activation for depression: A comprehensive systematic review and meta-analysis',finding:'Incluiu 105 ensaios e 13.933 participantes; a ativação comportamental tem ampla evidência causal para depressão, mas isso não prova que uma tarefa isolada do Nexo produza o mesmo efeito.',scope:'Depressão; não é evidência específica para o escore de autorregulação do Nexo.',doi:'10.1016/j.cpr.2026.102783',pmid:'42492146'},
  {id:'ACT-2025',design:'Meta-análise de 13 RCTs',title:'Effects of acceptance and commitment therapy on negative emotions, automatic thoughts and psychological flexibility for depression',finding:'ACT melhorou flexibilidade psicológica em comparação com controles (SMD 0,50; IC95% 0,35 a 0,66), com certeza moderada para esse desfecho.',scope:'Pessoas com depressão; o exercício curto do app é derivado de princípios da ACT, não foi testado como intervenção independente.',pmid:'40597900'},
  {id:'ER-2024',design:'Meta-análise de RCTs',title:'Emotional Regulation as a Transdiagnostic Process of Emotional Disorders in Therapy',finding:'Em 18 artigos randomizados, intervenções como Protocolo Unificado, TCC, DBT e mindfulness produziram melhora de regulação emocional, em geral de magnitude moderada durante o tratamento.',scope:'Transtornos emocionais; heterogeneidade e limitações metodológicas exigem cautela.',doi:'10.1002/cpp.2997',pmid:'38747373'},
  {id:'IPT-2023',design:'Meta-análise de 11 RCTs',title:'Effect of interpersonal psychotherapy on social functioning, overall functioning and negative emotions for depression',finding:'A psicoterapia interpessoal melhorou funcionamento social em comparação com controles (SMD -0,53; IC95% -0,80 a -0,26 na escala utilizada).',scope:'Depressão; não valida automaticamente qualquer recomendação relacional isolada.',doi:'10.1016/j.jad.2022.09.119',pmid:'36183821'},
  {id:'MCT-2024',design:'Meta-análise de RCTs',title:'Efficacy of metacognitive interventions for psychiatric disorders',finding:'A síntese incluiu 21 estudos de MCT e 28 de treinamento metacognitivo, totalizando 3.239 participantes; MCT superou lista de espera e, em média, outras formas de TCC, embora vários estudos tivessem limitações de qualidade.',scope:'Adultos com transtornos psiquiátricos; a técnica breve mostrada no app não foi testada isoladamente.',doi:'10.1080/16506073.2024.2434920',pmid:'39692039'},
  {id:'ST-PD-2014',design:'Ensaio randomizado multicêntrico',title:'Results of a multicenter randomized controlled trial of the clinical effectiveness of schema therapy for personality disorders',finding:'Em 323 pacientes, terapia do esquema apresentou maior recuperação de transtornos de personalidade e menor abandono que tratamento usual, além de melhores resultados em alguns desfechos funcionais.',scope:'Transtornos de personalidade. Não há base para o Nexo diagnosticar esquemas ou recomendar terapia do esquema apenas por uma queda de escore.',pmid:'24322378'},
  {id:'ST-BPD-2022',design:'Ensaio clínico randomizado multicêntrico',title:'Effectiveness of Predominantly Group Schema Therapy and Combined Individual and Group Schema Therapy for Borderline Personality Disorder',finding:'Em 495 participantes, terapia do esquema combinando sessões individuais e em grupo reduziu mais a gravidade do transtorno de personalidade borderline que tratamento usual.',scope:'Transtorno de personalidade borderline; não generalizar causalmente para usuários sem esse diagnóstico.',pmid:'35234828'},
]

export default function Suggestions(){
  const[rows,setRows]=useState<Checkin[]>([])
  const[loading,setLoading]=useState(true)
  useEffect(()=>{(async()=>{setLoading(true);const{data,error}=await supabase.from('nexo_records').select('id,payload,created_at').eq('record_type','checkin').order('created_at',{ascending:true});if(error)console.error(error);setRows((data||[]) as Checkin[]);setLoading(false)})()},[])

  const analysis=useMemo(()=>{
    if(!rows.length)return null
    const latest=rows.at(-1)!
    const latestTime=new Date(latest.created_at).getTime()
    const prior30=rows.slice(0,-1).filter(r=>{const t=new Date(r.created_at).getTime();return t>=latestTime-30*86400000&&t<latestTime})
    return {latest,prior30,domains:DOMAINS.map(domain=>{const current=score(latest,domain);const past=prior30.map(r=>score(r,domain)).filter(Number.isFinite);const baseline=mean(past);return{domain,current,baseline,n:past.length,below:Number.isFinite(current)&&Number.isFinite(baseline)&&current<baseline,delta:Number.isFinite(current)&&Number.isFinite(baseline)?current-baseline:NaN}})}
  },[rows])

  if(loading)return <p>Comparando seu check-in mais recente com seu histórico...</p>
  if(!analysis)return <><div className="eyebrow">evidência + comparação intraindividual</div><h1>Sugestões</h1><div className="card">Faça ao menos um check-in para iniciar a comparação.</div></>
  const enough=analysis.prior30.length>=3
  const flagged=analysis.domains.filter(x=>enough&&x.below)
  return <>
    <div className="eyebrow">evidência + comparação intraindividual</div><h1>Sugestões</h1>
    <div className="card suggestion-intro"><p>Esta aba compara o <b>check-in mais recente</b> com sua própria média dos <b>30 dias anteriores</b>. Uma queda não é diagnóstico, piora clínica nem prova de problema. Pode refletir variação normal, contexto ou erro de medida.</p><p>As evidências abaixo vêm apenas de meta-análises e estudos causais. As pequenas práticas propostas são <b>adaptações educativas de princípios terapêuticos</b>; não foram necessariamente testadas como intervenções isoladas.</p></div>
    {!enough&&<div className="card"><h3>Histórico ainda curto</h3><p>Há {analysis.prior30.length} check-in(s) anterior(es) nos últimos 30 dias. O Nexo exige pelo menos 3 registros prévios para exibir sugestões automáticas e reduzir interpretações baseadas em uma única oscilação.</p></div>}
    {enough&&<div className="grid">{analysis.domains.map(x=><div className={`card comparison ${x.below?'below':'within'}`} key={x.domain}><h3>{x.domain}</h3><b>{x.current.toFixed(2)}</b><small> atual</small><p>Média 30 dias: {x.baseline.toFixed(2)} · n={x.n}</p><span>{x.below?`${Math.abs(x.delta).toFixed(2)} abaixo da média pessoal`:'não está abaixo da média pessoal'}</span></div>)}</div>}
    {enough&&flagged.length===0&&<div className="card"><h3>Nenhuma área abaixo da sua média mensal</h3><p>Neste momento o sistema não aciona sugestões específicas. Continue observando tendências em vez de interpretar um único dia como bom ou ruim.</p></div>}
    {flagged.map(x=>{const g=guidance[x.domain];return <section className="card suggestion-card" key={x.domain}><div className="suggestion-head"><div><div className="eyebrow">{x.domain}</div><h2>{g.approach}</h2></div><span className="evidence-badge">{x.current.toFixed(2)} vs {x.baseline.toFixed(2)}</span></div><h3>Uma prática pequena para experimentar</h3><p>{g.practice}</p><h3>Lente da terapia do esquema</h3><p>{g.schema}</p><div className="evidence-links"><b>Base usada:</b>{g.evidence.map(id=>{const e=evidence.find(z=>z.id===id)!;return <a key={id} href={`#evidence-${id}`}>{e.design}</a>})}</div></section>})}
    <section className="section"><div className="eyebrow">fontes elegíveis</div><h2>Base de evidência</h2>{evidence.map(e=><article className="card evidence-card" id={`evidence-${e.id}`} key={e.id}><span className="evidence-badge">{e.design}</span><h3>{e.title}</h3><p>{e.finding}</p><p><b>Limite de generalização:</b> {e.scope}</p><small>{e.doi&&<>DOI: {e.doi} · </>}PMID: {e.pmid}</small></article>)}</section>
    <div className="card caution"><h3>Quando não usar esta aba como guia</h3><p>Não use essas sugestões para decidir sozinho sobre diagnóstico, medicação, interrupção de tratamento ou manejo de crise. Se houver sofrimento intenso, prejuízo funcional importante ou risco à segurança, a comparação com sua média mensal deixa de ser o critério relevante e é indicado buscar avaliação profissional.</p></div>
  </>
}
