import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../supabase'
import type {RawRecord} from '../today/todayTypes'
import {PRACTICES} from './practiceCatalog'
import {MANUAL_SKILL_OPTIONS,SKILL_BY_ID} from './skillCatalog'
import {buildDevelopmentPlan,manualRecommendation} from './developmentEngine'
import type {CompletionStatus,DevelopmentEventPayload,PracticeRecommendation,PracticeScope,SkillId} from './developmentTypes'

const EVIDENCE_LABEL={insufficient:'Há poucos registros',weak:'Há um padrão inicial',moderate:'O padrão apareceu em fontes diferentes',strong:'O padrão apareceu repetidamente em fontes diferentes'} as const
const COMPLETION_OPTIONS:{value:CompletionStatus;label:string}[]=[
  {value:'done',label:'Fiz'},
  {value:'partial',label:'Fiz parcialmente'},
  {value:'declined',label:'Decidi não fazer'},
  {value:'no-opportunity',label:'Não tive oportunidade'},
]

function uid(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}

async function saveDevelopmentEvent(payload:DevelopmentEventPayload){
  const{data:{user},error:userError}=await supabase.auth.getUser()
  if(userError||!user)throw userError||new Error('Sessão inválida.')
  const bytes=new TextEncoder().encode(JSON.stringify(payload)).length
  if(bytes>100000)throw new Error('O registro excedeu o limite seguro.')
  const{error}=await supabase.from('nexo_records').insert({user_id:user.id,record_type:'review',payload})
  if(error)throw error
}

function WhyRecommendation({recommendation}:{recommendation:PracticeRecommendation}){
  return <details className="development-why">
    <summary>Por que esta meta?</summary>
    <div>
      {recommendation.personalized?<><p><b>{EVIDENCE_LABEL[recommendation.evidenceLevel]}.</b> O Nexo combinou sinais do seu próprio histórico para ordenar esta prática.</p>
      <ul>{recommendation.evidence.slice(0,5).map((evidence,index)=><li key={`${evidence.source}-${index}`}><b>{evidence.label}</b><span>{evidence.detail}</span></li>)}</ul></>:<p>Esta prática foi escolhida manualmente. Seus registros ainda não foram usados para afirmar uma prioridade personalizada.</p>}
      <p className="method-note">Essa é uma hipótese de desenvolvimento baseada no seu próprio histórico, não uma avaliação clínica, diagnóstico ou prescrição.</p>
    </div>
  </details>
}

function PracticeCard({recommendation,onAccept,onAnother,onDecline,busy}:{recommendation:PracticeRecommendation;onAccept:()=>void;onAnother?:()=>void;onDecline?:()=>void;busy:boolean}){
  const p=recommendation.practice
  return <article className="card development-practice-card">
    <div className="development-practice-head"><div><div className="eyebrow">{recommendation.skill.category}</div><h3>{recommendation.skill.label}</h3></div><span className="development-time">{p.estimatedMinutes} min</span></div>
    <h2>{p.title}</h2>
    <p className="development-action">{p.description}</p>
    <div className="development-meta"><span>{p.difficulty==='low'?'Prática curta':'Prática intermediária'}</span>{p.requiresOpportunity&&<span>depende de uma oportunidade adequada</span>}</div>
    <WhyRecommendation recommendation={recommendation}/>
    <div className="development-actions">
      <button className="primary" disabled={busy} onClick={onAccept}>{busy?'Salvando...':'Quero praticar'}</button>
      {onAnother&&<button className="secondary" disabled={busy} onClick={onAnother}>Escolher outra</button>}
      {onDecline&&<button className="development-link" disabled={busy} onClick={onDecline}>Não quero trabalhar isso agora</button>}
    </div>
  </article>
}

type Assignment={assignmentId:string;recommendation:PracticeRecommendation;scope:PracticeScope}

function PracticeFeedback({assignment,onSaved}:{assignment:Assignment;onSaved:()=>Promise<void>}){
  const[completion,setCompletion]=useState<CompletionStatus>('done')
  const[utility,setUtility]=useState(5)
  const[effort,setEffort]=useState(5)
  const[result,setResult]=useState('')
  const[emotion,setEmotion]=useState('')
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')

  const save=async()=>{
    setBusy(true);setMessage('')
    try{
      await saveDevelopmentEvent({
        version:'1.0',subtype:'development_practice',phase:'outcome',
        assignmentId:assignment.assignmentId,practiceId:assignment.recommendation.practice.id,
        skill:assignment.recommendation.skill.id,scope:assignment.scope,
        completion,utility,effort,result:result.trim(),emotion:emotion.trim(),
      })
      setMessage('Feedback salvo. Ele poderá influenciar futuras escolhas de prática.')
      await onSaved()
    }catch{setMessage('Não foi possível salvar o feedback agora.')}
    finally{setBusy(false)}
  }

  return <section className="card development-feedback" aria-labelledby="development-feedback-title">
    <div className="eyebrow">depois da prática</div><h2 id="development-feedback-title">Como foi?</h2>
    <p>{assignment.recommendation.practice.title}</p>
    <div className="development-completion" role="group" aria-label="Realização da prática">
      {COMPLETION_OPTIONS.map(option=><button key={option.value} className={completion===option.value?'on':''} aria-pressed={completion===option.value} onClick={()=>setCompletion(option.value)}>{option.label}</button>)}
    </div>
    <label>Isso foi útil? <b>{utility}/10</b><input type="range" min="0" max="10" value={utility} onChange={event=>setUtility(Number(event.target.value))}/></label>
    <label>Quanto esforço exigiu? <b>{effort}/10</b><input type="range" min="0" max="10" value={effort} onChange={event=>setEffort(Number(event.target.value))}/></label>
    <label>O que aconteceu? <span>opcional</span><textarea value={result} onChange={event=>setResult(event.target.value)}/></label>
    <label>Como você ficou depois? <span>opcional</span><textarea value={emotion} onChange={event=>setEmotion(event.target.value)}/></label>
    {message&&<p className={message.startsWith('Feedback salvo')?'development-success':'development-error'} role="status">{message}</p>}
    <button className="primary" disabled={busy} onClick={()=>void save()}>{busy?'Salvando...':'Salvar feedback'}</button>
    <p className="method-note">“Não tive oportunidade” e “decidi não fazer” não são tratados como fracasso.</p>
  </section>
}

export default function DevelopmentPage(){
  const[records,setRecords]=useState<RawRecord[]>([])
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[busy,setBusy]=useState(false)
  const[choice,setChoice]=useState(0)
  const[manualSkill,setManualSkill]=useState<SkillId>('communication.clarity')
  const[assignment,setAssignment]=useState<Assignment|null>(null)

  const load=async()=>{
    setLoading(true);setError('')
    const{data,error:loadError}=await supabase.from('nexo_records').select('id,record_type,payload,created_at').order('created_at',{ascending:true})
    if(loadError){setError('Não foi possível carregar seus registros agora.');setLoading(false);return}
    setRecords((data||[]) as RawRecord[]);setLoading(false)
  }
  useEffect(()=>{void load()},[])

  const plan=useMemo(()=>buildDevelopmentPlan(records),[records])
  const dailyChoices=useMemo(()=>[plan.daily,...plan.alternatives].filter((item):item is PracticeRecommendation=>item!==null),[plan])
  const activeDaily=dailyChoices.length?dailyChoices[choice%dailyChoices.length]:null
  const manual=useMemo(()=>manualRecommendation(manualSkill,plan.context.lowCapacity),[manualSkill,plan.context.lowCapacity])

  const accept=async(recommendation:PracticeRecommendation,scope:PracticeScope)=>{
    setBusy(true)
    try{
      const assignmentId=uid()
      await saveDevelopmentEvent({
        version:'1.0',subtype:'development_practice',phase:'accepted',assignmentId,
        practiceId:recommendation.practice.id,skill:recommendation.skill.id,scope,assignedAt:new Date().toISOString(),
      })
      setAssignment({assignmentId,recommendation,scope})
      await load()
    }catch{setError('Não foi possível registrar a prática agora.')}
    finally{setBusy(false)}
  }

  const decline=async(recommendation:PracticeRecommendation)=>{
    setBusy(true)
    try{
      await saveDevelopmentEvent({
        version:'1.0',subtype:'development_practice',phase:'declined',assignmentId:uid(),
        practiceId:recommendation.practice.id,skill:recommendation.skill.id,scope:'daily',assignedAt:new Date().toISOString(),
      })
      setChoice(0)
      await load()
    }catch{setError('Não foi possível registrar sua preferência agora.')}
    finally{setBusy(false)}
  }

  const topLearning=plan.strategyLearning.filter(item=>item.outcomes>0).slice(0,3)
  const practiceById=new Map(PRACTICES.map(practice=>[practice.id,practice]))

  if(loading)return <section className="development-loading"><div className="security-spinner" aria-hidden="true"/><p>Cruzando seus registros para escolher uma prática pequena...</p></section>

  return <div className="development-page">
    <header className="development-header">
      <div className="eyebrow">aprendizagem adaptativa · dados pessoais</div>
      <h1>Desenvolvimento</h1>
      <p>Uma prática pequena por vez.</p>
      <small>O Nexo combina sinais quantitativos, registros qualitativos, valores e resultados de práticas anteriores. Não produz diagnóstico nem escore psicológico global.</small>
    </header>

    {error&&<div className="development-error" role="alert">{error}</div>}

    <section className="development-section" aria-labelledby="development-today-title">
      <div className="development-section-head"><div><div className="eyebrow">para hoje</div><h2 id="development-today-title">A menor prática útil para testar agora</h2></div>
      <div className="development-context" aria-label="Contexto usado para ajustar a prática"><span>Energia <b>{plan.context.energy??'—'}</b></span><span>Estresse <b>{plan.context.stress??'—'}</b></span></div></div>
      {activeDaily?<PracticeCard recommendation={activeDaily} busy={busy} onAccept={()=>void accept(activeDaily,'daily')} onAnother={dailyChoices.length>1?()=>setChoice(value=>value+1):undefined} onDecline={()=>void decline(activeDaily)}/>:<div className="card development-empty">
        <h3>Histórico ainda insuficiente para priorização personalizada</h3>
        <p>O Nexo exige pelo menos três observações relevantes e pelo menos um sinal quantitativo antes de transformar o histórico em recomendação personalizada.</p>
        <label>Escolher uma habilidade manualmente<select value={manualSkill} onChange={event=>setManualSkill(event.target.value as SkillId)}>{MANUAL_SKILL_OPTIONS.map(skill=><option key={skill} value={skill}>{SKILL_BY_ID[skill].label}</option>)}</select></label>
        {manual&&<PracticeCard recommendation={manual} busy={busy} onAccept={()=>void accept(manual,'daily')}/>} 
      </div>}
      {plan.context.lowCapacity&&<p className="method-note development-capacity-note">Como o último registro combina energia ≤4 e estresse ≥7, o Nexo restringiu a escolha a práticas curtas e de baixa complexidade. Isso adapta a carga da interface e não pressupõe relação causal entre contexto e desempenho.</p>}
    </section>

    <section className="development-section" aria-labelledby="development-week-title">
      <div className="eyebrow">esta semana</div><h2 id="development-week-title">Até duas oportunidades de prática</h2>
      {plan.weekly.length?<div className="development-week-grid">{plan.weekly.map((recommendation,index)=><article className="card development-week-card" key={`${recommendation.practice.id}-${index}`}>
        <span className="development-week-number">{index+1}</span><div><h3>{recommendation.skill.label}</h3><p>{recommendation.practice.weeklyDescription}</p><WhyRecommendation recommendation={recommendation}/><button className="secondary" disabled={busy} onClick={()=>void accept(recommendation,'weekly')}>Registrar prática</button></div>
      </article>)}</div>:<div className="card development-empty"><p>As metas semanais personalizadas aparecerão quando houver dados suficientes. Você ainda pode escolher manualmente uma prática curta acima.</p></div>}
    </section>

    {assignment&&<PracticeFeedback key={assignment.assignmentId} assignment={assignment} onSaved={async()=>{await load();setAssignment(null)}}/>}

    <section className="development-section" aria-labelledby="development-reason-title">
      <div className="eyebrow">por que estou praticando isso?</div><h2 id="development-reason-title">Habilidades em acompanhamento</h2>
      {plan.candidates.length?<div className="development-skill-grid">{plan.candidates.slice(0,6).map(candidate=><article className="card development-skill" key={candidate.skill}>
        <span>{SKILL_BY_ID[candidate.skill].category}</span><h3>{SKILL_BY_ID[candidate.skill].label}</h3>
        <p>{EVIDENCE_LABEL[candidate.evidenceLevel]}</p>
        <small>{candidate.observationCount} observações somadas em {candidate.sourceCount} tipo(s) de fonte. A prioridade interna serve apenas para ordenar práticas e não é exibida como escore psicológico.</small>
      </article>)}</div>:<div className="card development-empty"><p>Ainda não há sinais suficientes para formar uma lista personalizada de habilidades.</p></div>}
    </section>

    <section className="development-section" aria-labelledby="development-learning-title">
      <div className="eyebrow">o que tem funcionado para mim?</div><h2 id="development-learning-title">Aprendizagem pelas práticas anteriores</h2>
      {topLearning.length?<div className="development-learning-grid">{topLearning.map(stat=>{const practice=practiceById.get(stat.practiceId);return <article className="card" key={stat.practiceId}>
        <h3>{practice?.title??'Prática registrada'}</h3>
        <div className="development-kpis"><div><b>{stat.outcomes}</b><span>feedbacks</span></div><div><b>{stat.meanUtility===null?'—':stat.meanUtility.toFixed(1)}</b><span>utilidade média</span></div><div><b>{stat.meanEffort===null?'—':stat.meanEffort.toFixed(1)}</b><span>esforço médio</span></div></div>
        <p className="method-note">Associação no seu histórico. Não demonstra causalidade nem eficácia clínica.</p>
      </article>})}</div>:<div className="card development-empty"><p>Depois que você registrar utilidade e esforço, o Nexo poderá espaçar práticas úteis e reduzir a prioridade de estratégias repetidamente pouco úteis.</p></div>}
    </section>

    <section className="card development-method" aria-labelledby="development-method-title">
      <div className="eyebrow">transparência metodológica</div><h2 id="development-method-title">Como o Nexo escolhe minhas práticas?</h2>
      <p>O Nexo combina seus registros recentes, comparação com seu próprio histórico, padrões qualitativos recorrentes, valores confirmados e resultados de práticas anteriores para escolher uma pequena habilidade para exercitar.</p>
      <p>Uma palavra isolada não produz uma recomendação. Padrões qualitativos precisam se repetir, e uma recomendação personalizada também precisa de sinal quantitativo.</p>
      <p><b>As recomendações são hipóteses de desenvolvimento, não diagnósticos, prescrições clínicas ou medidas de inteligência, personalidade ou saúde mental.</b></p>
      <p className="method-note">O sistema não usa IA generativa nem envia o conteúdo dos seus registros a serviços externos para produzir estas recomendações.</p>
    </section>
  </div>
}
