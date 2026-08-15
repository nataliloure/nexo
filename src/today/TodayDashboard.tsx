import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {supabase} from '../supabase'
import WhyThisInsight from './WhyThisInsight'
import type {Domain,DomainComparison,RawRecord,TrajectoryRange} from './todayTypes'
import {DOMAINS,calculateAllDomainComparisons,calculateDomainScore,calculateValueActionConsistency,choosePositiveDomains,chooseTodayAttention,finiteNumber,isObject,questionForToday,selectTrajectoryCheckins,summarizeExperiments,summarizeRelations} from './todayMetrics'

const CONTEXT_FIELDS=[['energy','Energia'],['stress','Estresse'],['connection','Conexão social'],['sleep','Sono']] as const

function changeText(comparison:DomainComparison){
  if(comparison.current===null)return'Sem dado válido neste check-in'
  if(comparison.change==='insufficient-data')return'Histórico insuficiente para comparação'
  if(comparison.change==='within')return'→ próximo ao seu padrão recente'
  const difference=Math.abs(comparison.difference??0).toFixed(2)
  return comparison.change==='above'?`↑ ${difference} acima da média pessoal`:`↓ ${difference} abaixo da média pessoal`
}

function StateCard({comparison}:{comparison:DomainComparison}){
  return <article className={`today-domain today-${comparison.change}`}>
    <div><span>{comparison.domain}</span><strong>{comparison.current===null?'—':comparison.current.toFixed(2)}</strong><small>/5</small></div>
    <p>{changeText(comparison)}</p>
  </article>
}

function TrajectoryRow({domain,checkins}:{domain:Domain;checkins:RawRecord[]}){
  const values=checkins.map(record=>calculateDomainScore(record.payload,domain))
  const valid=values.filter((value):value is number=>value!==null)
  const description=valid.length?`${valid.length} valor${valid.length===1?'':'es'} entre ${Math.min(...valid).toFixed(2)} e ${Math.max(...valid).toFixed(2)}`:'sem valores válidos'
  return <div className="today-trajectory-row">
    <div><b>{domain}</b><small>{description}</small></div>
    <div className="today-spark-bars" role="img" aria-label={`${domain}: ${description}`}>
      {values.map((value,index)=><i key={index} className={value===null?'is-missing':''} style={{height:value===null?'6%':`${Math.max(12,value/5*100)}%`}} title={value===null?'registro sem valor válido':`${value.toFixed(2)}/5`}/>) }
    </div>
  </div>
}

export default function TodayDashboard(){
  const navigate=useNavigate()
  const[records,setRecords]=useState<RawRecord[]>([])
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[trajectoryRange,setTrajectoryRange]=useState<TrajectoryRange>('7')

  useEffect(()=>{
    let active=true
    const load=async()=>{
      setLoading(true);setError('')
      const{data,error:loadError}=await supabase.from('nexo_records').select('id,record_type,payload,created_at').order('created_at',{ascending:true})
      if(!active)return
      if(loadError){setError('Não foi possível carregar seus registros agora.');setLoading(false);return}
      setRecords((data||[]) as RawRecord[]);setLoading(false)
    }
    void load()
    return()=>{active=false}
  },[])

  const model=useMemo(()=>{
    const checkins=records.filter(record=>record.record_type==='checkin')
    const latest=checkins.at(-1)??null
    const comparisons=latest?calculateAllDomainComparisons(checkins,latest):[]
    const attention=chooseTodayAttention(comparisons)
    const positiveDomains=choosePositiveDomains(comparisons)
    const values=calculateValueActionConsistency(records)
    const experiments=summarizeExperiments(records)
    const relations=summarizeRelations(records)
    const question=questionForToday(attention[0],values.confirmedValues.length>0)
    return{checkins,latest,comparisons,attention,positiveDomains,values,experiments,relations,question}
  },[records])

  const trajectory=useMemo(()=>selectTrajectoryCheckins(model.checkins,trajectoryRange),[model.checkins,trajectoryRange])
  const todayLabel=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date())
  const completeExperimentCount=model.experiments.complete
  const commitmentRecords=records.filter(record=>record.record_type==='value'&&isObject(record.payload)&&record.payload.subtype==='act_commitment')
  const commitmentActionCount=commitmentRecords.reduce((total,record)=>{
    if(!isObject(record.payload)||!Array.isArray(record.payload.items))return total
    return total+record.payload.items.filter(item=>isObject(item)&&(item.category==='acao_comprometida'||item.category==='acao_realizada')).length
  },0)

  if(loading)return <section className="today-loading"><div className="security-spinner" aria-hidden="true"/><p>Organizando seus registros para a visão de hoje...</p></section>
  if(error)return <section className="card caution"><h2>Não foi possível montar a visão de hoje</h2><p>{error}</p></section>

  return <div className="today-dashboard">
    <header className="today-header">
      <div className="eyebrow">{todayLabel}</div>
      <h1>Hoje</h1>
      <p>Veja o que seus registros sugerem observar hoje.</p>
      <small>Os resultados são comparações com seu próprio histórico e descrições dos registros disponíveis.</small>
    </header>

    <section className="today-section" aria-labelledby="today-state-title">
      <div className="today-section-head"><div><div className="eyebrow">check-in mais recente</div><h2 id="today-state-title">Seu estado hoje</h2></div>{!model.latest&&<button className="primary" onClick={()=>navigate('/checkin')}>Fazer check-in</button>}</div>
      {!model.latest?<div className="card today-empty"><p>Faça seu primeiro check-in para começar a construir seu padrão pessoal.</p></div>:<>
        <div className="today-domain-grid">{model.comparisons.map(comparison=><StateCard key={comparison.domain} comparison={comparison}/>)}</div>
        <div className="today-context card">
          <div><h3>Contexto do registro</h3><small>Escalas de 0 a 10 associadas ao mesmo check-in.</small></div>
          <div className="today-context-grid">{CONTEXT_FIELDS.map(([key,label])=>{const value=isObject(model.latest?.payload)?finiteNumber(model.latest.payload[key]):null;return <div key={key}><span>{label}</span><b>{value===null?'—':`${value}/10`}</b></div>})}</div>
        </div>
        {model.comparisons.every(comparison=>comparison.change==='insufficient-data')&&<p className="method-note today-inline-note">São necessários pelo menos 3 check-ins anteriores válidos nos 30 dias precedentes para comparar o resultado atual com sua média pessoal.</p>}
      </>}
    </section>

    <section className="today-section" aria-labelledby="today-attention-title">
      <div className="today-section-head"><div><div className="eyebrow">comparação intraindividual</div><h2 id="today-attention-title">O que merece minha atenção hoje?</h2></div></div>
      {model.attention.length===0?<div className="card today-empty"><p>Nenhum domínio ultrapassou a tolerância descritiva de 0,30 ponto abaixo do seu padrão recente, ou ainda não há histórico suficiente para essa comparação.</p></div>:<div className="today-insight-grid">{model.attention.map(insight=><article className="card today-insight attention" key={insight.domain}>
        <span className="today-pill">Observar</span><h3>{insight.title}</h3><p>{insight.detail}</p><p className="method-note">Esta é uma comparação com seu próprio histórico, não uma avaliação da sua capacidade.</p>
        <WhyThisInsight comparison={insight.comparison}/><button className="secondary" onClick={()=>navigate(insight.route)}>{insight.actionLabel}</button>
      </article>)}</div>}
    </section>

    <section className="today-section" aria-labelledby="today-working-title">
      <div className="today-section-head"><div><div className="eyebrow">sinais favoráveis descritivos</div><h2 id="today-working-title">O que está funcionando?</h2></div></div>
      {model.positiveDomains.length===0&&model.values.realized===0?<div className="card today-empty"><p>Com os dados disponíveis, ainda não há um sinal acima da tolerância de comparação ou ação vinculada a valor registrada como realizada nos últimos 30 dias.</p></div>:<div className="today-insight-grid">
        {model.positiveDomains.slice(0,model.values.realized>0?1:2).map(comparison=><article className="card today-insight strength" key={comparison.domain}><span className="today-pill">Padrão recente</span><h3>{comparison.domain} apareceu acima da sua média pessoal recente.</h3><p>O resultado atual ficou {Math.abs(comparison.difference??0).toFixed(2)} ponto acima da média dos {comparison.baselineN} check-ins anteriores disponíveis.</p><WhyThisInsight comparison={comparison}/></article>)}
        {model.values.realized>0&&<article className="card today-insight strength"><span className="today-pill">Valores em ação</span><h3>{model.values.realized} de {model.values.actions} ações vinculadas a valores foram registradas como realizadas.</h3><p>Isso descreve comportamento registrado nos últimos 30 dias e não representa melhora psicológica.</p><button className="secondary" onClick={()=>navigate('/compromissos')}>Ver compromissos</button></article>}
      </div>}
    </section>

    <div className="today-two-column">
      <section className="card today-feature" aria-labelledby="today-values-title">
        <div className="eyebrow">ACT · direção e comportamento</div><h2 id="today-values-title">Valores em ação</h2>
        {model.values.confirmedValues.length===0?<p>Confirme pelo menos um valor e vincule ações a ele para acompanhar coerência valor-ação.</p>:<>
          <div className="today-kpi"><strong>{model.values.ratio===null?'—':`${Math.round(model.values.ratio*100)}%`}</strong><span>Coerência valor-ação nos últimos 30 dias</span></div>
          <p>{model.values.actions?`${model.values.realized} de ${model.values.actions} ações comprometidas ligadas a valores confirmados foram registradas como realizadas.`:'Ainda não há ações suficientes vinculadas a valores confirmados.'}</p>
          {model.values.latestAction&&<div className="today-latest"><small>Ação vinculada mais recente</small><b>{model.values.latestAction.text||'Ação registrada'}</b><span>Valor: {model.values.latestAction.value} · {model.values.latestAction.status}</span></div>}
          <p className="method-note">Percentual de ações comprometidas ligadas a valores confirmados que foram registradas como realizadas. Não representa saúde psicológica nem qualidade dos seus valores.</p>
        </>}
        <button className="secondary" onClick={()=>navigate('/compromissos')}>Ver compromissos</button>
      </section>

      <section className="card today-feature" aria-labelledby="today-experiment-title">
        <div className="eyebrow">aprendizagem pela experiência</div><h2 id="today-experiment-title">Previsão × experiência</h2>
        {!model.experiments.complete?<p>Registre experimentos com conteúdo de “antes” e “depois” para visualizar diferenças entre expectativa e experiência.</p>:<>
          <p>Nos registros completos disponíveis, a intensidade observada foi menor que a prevista em <b>{model.experiments.observedLower} de {model.experiments.complete}</b> situações.</p>
          {model.experiments.latest&&<div className="today-experiment-numbers"><div><span>Previsto</span><b>{model.experiments.latest.anticipated}/10</b></div><div><span>Observado</span><b>{model.experiments.latest.observed}/10</b></div><div><span>Diferença</span><b>{model.experiments.latest.difference>0?'+':''}{model.experiments.latest.difference}</b></div>{model.experiments.latest.certainty!==null&&<div><span>Certeza prevista</span><b>{model.experiments.latest.certainty}%</b></div>}</div>}
          <p className="method-note">Diferenças entre previsão e experiência são material de aprendizagem. Não demonstram automaticamente viés cognitivo, irracionalidade ou transtorno.</p>
        </>}
        <button className="secondary" onClick={()=>navigate('/experimentos')}>Ver experimentos</button>
      </section>
    </div>

    <section className="card today-feature" aria-labelledby="today-relations-title">
      <div className="eyebrow">padrões interpessoais registrados</div><h2 id="today-relations-title">Relações</h2>
      {model.relations.n<3?<p>Registre pelo menos 3 interações para começar a comparar a variabilidade das dimensões relacionais.</p>:<>
        <p>Em {model.relations.n} interações disponíveis, <b>{model.relations.mostVariable}</b> variou mais entre registros e <b>{model.relations.mostStable}</b> permaneceu relativamente mais estável.</p>
        {model.relations.n>=5&&model.relations.presenceConnectionCorrelation!==null&&Math.abs(model.relations.presenceConnectionCorrelation)>=0.30&&<p>Presença e conexão posterior tenderam a variar {model.relations.presenceConnectionCorrelation>0?'na mesma direção':'em direções opostas'} nos registros disponíveis (r = {model.relations.presenceConnectionCorrelation.toFixed(2)}). <span className="method-note">Associação descritiva. Não permite concluir causalidade.</span></p>}
      </>}
      <button className="secondary" onClick={()=>navigate('/relacoes')}>Ver relações</button>
    </section>

    <section className="card today-feature" aria-labelledby="today-trajectory-title">
      <div className="today-section-head"><div><div className="eyebrow">mudança intraindividual</div><h2 id="today-trajectory-title">Sua trajetória</h2></div><div className="today-range" aria-label="Período da trajetória">{(['7','30','90'] as TrajectoryRange[]).map(mode=><button key={mode} className={trajectoryRange===mode?'on':''} aria-pressed={trajectoryRange===mode} onClick={()=>setTrajectoryRange(mode)}>{mode==='7'?'7 registros':`${mode} dias`}</button>)}</div></div>
      {!trajectory.length?<p>Nenhum check-in disponível no período selecionado.</p>:<div className="today-trajectories">{DOMAINS.map(domain=><TrajectoryRow domain={domain} checkins={trajectory} key={domain}/>)}</div>}
      <p className="method-note">“7 registros” significa os últimos 7 check-ins disponíveis, não 7 dias consecutivos. Ausências permanecem ausentes.</p>
    </section>

    <section className="today-question" aria-labelledby="today-question-title">
      <div className="eyebrow">uma pergunta para hoje</div><h2 id="today-question-title">{model.question.question}</h2><button className="primary" onClick={()=>navigate(model.question.route)}>{model.question.label}</button>
    </section>

    <section className="card today-learning" aria-labelledby="today-learning-title">
      <div className="eyebrow">transparência metodológica</div><h2 id="today-learning-title">Como o Nexo está lendo meus dados</h2>
      <p>Com seus registros, o Nexo procura identificar mudanças em relação ao seu próprio padrão, relações entre contexto, comportamento e experiência, coerência entre valores e ações e diferenças entre previsões e resultados observados.</p>
      <p><b>O Nexo não tenta inferir diagnóstico, personalidade ou estado clínico.</b></p>
      <div className="today-data-availability" aria-label="Base disponível para análise"><div><b>{model.checkins.length}</b><span>Check-ins</span></div><div><b>{model.relations.n}</b><span>Interações</span></div><div><b>{completeExperimentCount}</b><span>Experimentos completos</span></div><div><b>{model.values.confirmedValues.length}</b><span>Valores confirmados</span></div><div><b>{commitmentActionCount}</b><span>Ações comprometidas</span></div></div>
      <p className="method-note">Essas contagens informam a base disponível para análise. Acumular mais registros não é, por si só, o objetivo da plataforma.</p>
    </section>
  </div>
}
