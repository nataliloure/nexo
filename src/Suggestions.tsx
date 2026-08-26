import{useEffect,useMemo,useState}from'react'
import{supabase}from'./supabase'
import type{RawRecord}from'./today/todayTypes'
import WearableImport from'./wearable/WearableImport'
import{summarizeWearable}from'./wearable/wearableMetrics'
import type{WearableMetricSummary,WearableSummary}from'./wearable/wearableTypes'
import'./wearable/wearable.css'

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

function formatSleep(minutes:number|null){if(minutes===null)return'—';const hours=Math.floor(minutes/60),rest=Math.round(minutes%60);return`${hours}h${rest?` ${rest}min`:''}`}
function metricBaseline(metric:WearableMetricSummary,formatter:(value:number)=>string){return metric.baseline===null?`histórico insuficiente · n=${metric.baselineN}`:`média 30 dias ${formatter(metric.baseline)} · n=${metric.baselineN}`}
function metricState(metric:WearableMetricSummary){if(metric.signal==='insufficient')return'Sem comparação longitudinal ainda';if(metric.signal==='within')return'Dentro da variação recente';if(metric.signal==='higher')return'Acima do padrão recente';return'Abaixo do padrão recente'}

function WearableContext({summary,onImported}:{summary:WearableSummary;onImported:()=>Promise<void>}){
  const hasData=summary.latestDate!==null
  return <section className="card wearable-context" aria-labelledby="wearable-context-title">
    <div className="wearable-head"><div><div className="eyebrow">contexto do smartwatch</div><h2 id="wearable-context-title">Sono, estresse e frequência cardíaca</h2></div>{summary.source&&<span className="wearable-source">{summary.source}</span>}</div>
    {!hasData?<><p>Nenhum dado de smartwatch foi importado ainda. Você pode integrar um CSV ou JSON exportado pelo app do relógio.</p><WearableImport onImported={onImported}/></>:<>
      <p>Último dia disponível: <b>{summary.latestDate}</b>{!summary.fresh&&<> · <b>fora da janela de 2 dias</b> do check-in mais recente</>}.</p>
      <div className="wearable-grid">
        <div className="wearable-metric"><small>Sono</small><b>{formatSleep(summary.sleep.latest)}</b><small>{metricBaseline(summary.sleep,value=>formatSleep(value))}</small><small>{metricState(summary.sleep)}</small></div>
        <div className="wearable-metric"><small>Estresse do dispositivo</small><b>{summary.stress.latest===null?'—':summary.stress.latest.toFixed(0)}</b><small>{metricBaseline(summary.stress,value=>value.toFixed(0))}</small><small>{metricState(summary.stress)}</small></div>
        <div className="wearable-metric"><small>BPM de repouso</small><b>{summary.restingBpm.latest===null?'—':summary.restingBpm.latest.toFixed(0)}</b><small>{metricBaseline(summary.restingBpm,value=>`${value.toFixed(0)} bpm`)}</small><small>{metricState(summary.restingBpm)}</small></div>
        <div className="wearable-metric"><small>BPM médio</small><b>{summary.averageBpm===null?'—':summary.averageBpm.toFixed(0)}</b><small>Mostrado como contexto. Não é usado sozinho para ajustar uma sugestão.</small></div>
      </div>
      {(summary.lowerSleep||summary.higherStressBurden||summary.higherRestingBpm)&&<div className="wearable-signal"><b>Há um desvio em relação ao seu próprio histórico.</b><p>{summary.lowerSleep&&'Sono ficou abaixo do padrão recente. '}{summary.higherStressBurden&&'O escore de estresse se deslocou na direção de maior carga segundo a orientação dessa fonte. '}{summary.higherRestingBpm&&'O BPM de repouso ficou acima do padrão recente. '}Esses dados são contexto do dispositivo, não diagnóstico nem explicação causal do seu check-in.</p></div>}
      <details><summary>Atualizar dados do smartwatch</summary><WearableImport onImported={onImported}/></details>
    </>}
    <p className="method-note">As comparações do relógio exigem pelo menos 5 dias prévios da mesma fonte nos 30 dias anteriores. Escalas de estresse de fabricantes diferentes não são misturadas. Duração do sono, escores proprietários e BPM podem conter erro de medição.</p>
  </section>
}

function WearableSuggestionNote({summary}:{summary:WearableSummary}){
  if(!summary.fresh)return null
  if(!summary.shouldReduceLoad&&!summary.higherRestingBpm)return null
  return <div className="wearable-adjustment"><b>Contexto do smartwatch para esta prática</b>{summary.shouldReduceLoad?<p>Como o registro recente também mostra {summary.lowerSleep?'sono abaixo do seu padrão pessoal':''}{summary.lowerSleep&&summary.higherStressBurden?' e ':''}{summary.higherStressBurden?'estresse do dispositivo em direção a maior carga':''}, prefira uma versão curta da prática, com uma única tentativa observável. Isso reduz a carga da tarefa; não presume que sono ou estresse tenham causado o resultado do check-in.</p>:null}{summary.higherRestingBpm?<p>O BPM de repouso também apareceu acima do seu padrão recente. O Nexo mostra isso apenas como contexto fisiológico e não o converte em ansiedade, estresse, doença ou piora psicológica.</p>:null}</div>
}

export default function Suggestions(){
  const[records,setRecords]=useState<RawRecord[]>([])
  const[loading,setLoading]=useState(true)
  const load=async()=>{setLoading(true);const{data,error}=await supabase.from('nexo_records').select('id,record_type,payload,created_at').order('created_at',{ascending:true});if(error)console.error(error);setRecords((data||[]) as RawRecord[]);setLoading(false)}
  useEffect(()=>{void load()},[])

  const rows=useMemo(()=>records.filter(record=>record.record_type==='checkin').map(record=>({id:record.id,created_at:record.created_at,payload:record.payload})) as Checkin[],[records])
  const analysis=useMemo(()=>{
    if(!rows.length)return null
    const latest=rows.at(-1)!
    const latestTime=new Date(latest.created_at).getTime()
    const prior30=rows.slice(0,-1).filter(r=>{const t=new Date(r.created_at).getTime();return t>=latestTime-30*86400000&&t<latestTime})
    return{latest,prior30,domains:DOMAINS.map(domain=>{const current=score(latest,domain);const past=prior30.map(r=>score(r,domain)).filter(Number.isFinite);const baseline=mean(past);return{domain,current,baseline,n:past.length,below:Number.isFinite(current)&&Number.isFinite(baseline)&&current<baseline,delta:Number.isFinite(current)&&Number.isFinite(baseline)?current-baseline:NaN}})}
  },[rows])
  const anchorDate=analysis?.latest.payload?.date||analysis?.latest.created_at||null
  const wearable=useMemo(()=>summarizeWearable(records,anchorDate),[records,anchorDate])

  if(loading)return <p>Comparando seu check-in e os dados disponíveis do smartwatch com seu histórico...</p>
  if(!analysis)return <><div className="eyebrow">evidência + comparação intraindividual</div><h1>Sugestões</h1><div className="card">Faça ao menos um check-in para iniciar a comparação psicológica.</div><WearableContext summary={wearable} onImported={load}/></>
  const enough=analysis.prior30.length>=3
  const flagged=analysis.domains.filter(x=>enough&&x.below)
  const wearableOnlyContext=wearable.fresh&&(wearable.lowerSleep||wearable.higherStressBurden||wearable.higherRestingBpm)
  return <>
    <div className="eyebrow">evidência + comparação intraindividual</div><h1>Sugestões</h1>
    <div className="card suggestion-intro"><p>Esta aba compara o <b>check-in mais recente</b> com sua própria média dos <b>30 dias anteriores</b> e, quando disponível, acrescenta sono, estresse e BPM do smartwatch como <b>contexto fisiológico separado</b>. Uma queda não é diagnóstico, piora clínica nem prova de problema. Pode refletir variação normal, contexto ou erro de medida.</p><p>O smartwatch <b>não aciona sozinho uma sugestão psicológica</b>. Ele pode apenas reduzir a carga de uma prática já indicada pelo histórico do check-in quando sono ou estresse do dispositivo estão diferentes do seu padrão pessoal.</p><p>As evidências abaixo vêm apenas de meta-análises e estudos causais. As pequenas práticas propostas são <b>adaptações educativas de princípios terapêuticos</b>; não foram necessariamente testadas como intervenções isoladas.</p></div>
    <WearableContext summary={wearable} onImported={load}/>
    {!enough&&<div className="card"><h3>Histórico ainda curto</h3><p>Há {analysis.prior30.length} check-in(s) anterior(es) nos últimos 30 dias. O Nexo exige pelo menos 3 registros prévios para exibir sugestões automáticas e reduzir interpretações baseadas em uma única oscilação.</p></div>}
    {enough&&<div className="grid">{analysis.domains.map(x=><div className={`card comparison ${x.below?'below':'within'}`} key={x.domain}><h3>{x.domain}</h3><b>{x.current.toFixed(2)}</b><small> atual</small><p>Média 30 dias: {x.baseline.toFixed(2)} · n={x.n}</p><span>{x.below?`${Math.abs(x.delta).toFixed(2)} abaixo da média pessoal`:'não está abaixo da média pessoal'}</span></div>)}</div>}
    {enough&&flagged.length===0&&<div className="card"><h3>Nenhuma área abaixo da sua média mensal</h3><p>Neste momento o sistema não aciona sugestões psicológicas específicas. Continue observando tendências em vez de interpretar um único dia como bom ou ruim.</p>{wearableOnlyContext&&<p><b>Há contexto diferente no smartwatch</b>, mas o Nexo não transforma isso sozinho em uma recomendação psicológica. Use esses dados para contextualizar o dia e, se fizer sentido, registrar um novo check-in.</p>}</div>}
    {flagged.map(x=>{const g=guidance[x.domain];return <section className="card suggestion-card" key={x.domain}><div className="suggestion-head"><div><div className="eyebrow">{x.domain}</div><h2>{g.approach}</h2></div><span className="evidence-badge">{x.current.toFixed(2)} vs {x.baseline.toFixed(2)}</span></div><h3>Uma prática pequena para experimentar</h3><p>{g.practice}</p><WearableSuggestionNote summary={wearable}/><h3>Lente da terapia do esquema</h3><p>{g.schema}</p><div className="evidence-links"><b>Base usada:</b>{g.evidence.map(id=>{const e=evidence.find(z=>z.id===id)!;return <a key={id} href={`#evidence-${id}`}>{e.design}</a>})}</div></section>})}
    <section className="section"><div className="eyebrow">fontes elegíveis</div><h2>Base de evidência</h2>{evidence.map(e=><article className="card evidence-card" id={`evidence-${e.id}`} key={e.id}><span className="evidence-badge">{e.design}</span><h3>{e.title}</h3><p>{e.finding}</p><p><b>Limite de generalização:</b> {e.scope}</p><small>{e.doi&&<>DOI: {e.doi} · </>}PMID: {e.pmid}</small></article>)}</section>
    <div className="card caution"><h3>Quando não usar esta aba como guia</h3><p>Não use essas sugestões, nem os dados do smartwatch, para decidir sozinho sobre diagnóstico, medicação, interrupção de tratamento ou manejo de crise. BPM ou sono muito diferentes do habitual, especialmente quando acompanhados de sintomas físicos, merecem avaliação apropriada e não devem ser reduzidos a uma interpretação psicológica do aplicativo.</p></div>
  </>
}
