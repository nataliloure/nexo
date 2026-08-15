import {useEffect,useMemo,useState} from 'react'
import {createPortal} from 'react-dom'
import {supabase} from './supabase'

type Category='valor'|'meta'|'acao_comprometida'|'acao_realizada'|'experiencia_interna'|'contexto'|'aprendizado'|'nao_classificavel'
type Confidence='alta'|'moderada'|'baixa'
type Row={
  id:string
  category:Category
  text:string
  description:string
  area:string
  valueRelated:string
  goalRelated:string
  status:string
  confidence:Confidence
  justification:string
}
type DbRecord={id:string;created_at:string;record_type:string;payload:any}

const CATEGORY_LABELS:Record<Category,string>={
  valor:'Valor',meta:'Meta',acao_comprometida:'Ação comprometida',acao_realizada:'Ação realizada',experiencia_interna:'Barreira ou experiência interna',contexto:'Contexto / acontecimento',aprendizado:'Reflexão ou aprendizado',nao_classificavel:'Não classificável'
}
const VALUE_STATUS=['candidato','explícito','confirmado']
const GOAL_STATUS=['planejada','em andamento','concluída','não determinada']
const ACTION_STATUS=['planejada','realizada','parcialmente realizada','não realizada','não determinada']
const OTHER_STATUS=['registrado']
const AREAS=['','relações','família','amizade','trabalho','estudo','saúde','criatividade','comunidade','autocuidado','outra']

const valueExplicit=/\b(quero ser|quero agir|quero cuidar|quero cultivar|quero viver|quero me relacionar|quero estar presente|eu valorizo|é importante para mim agir|prezo por)\b/i
const valueCandidate=/\b(gostaria de ser|gostaria de agir|quero ter mais|para mim importa|me importa muito|quero me tornar)\b/i
const reflection=/\b(percebi|aprendi|notei|entendi|me dei conta|descobri|compreendi|concluí que)\b/i
const internal=/\b(senti|fiquei|estou me sentindo|ansios[ao]|ansiedade|medo|triste|tristeza|raiva|culpa|vergonha|preocupad[ao]|me preocupei|pensei que|vontade de evitar|impulso de)\b/i
const realized=/\b(fiz|fui|enviei|conversei|liguei|escrevi|terminei|concluí|entreguei|disse|falei|pedi|recusei|comecei|iniciei|estudei|treinei|caminhei|marquei|agendei|compareci|organizei|respondi|procurei|preparei)\b/i
const notRealized=/\b(não consegui|não fiz|não fui|evitei|desisti|adiei|procrastinei)\b/i
const partial=/\b(comecei mas|fiz parte|parcialmente|um pouco|avancei)\b/i
const planned=/\b(vou|irei|pretendo|planejo|decidi|farei|vou tentar|me comprometo a)\b/i
const goal=/\b(até (hoje|amanhã|segunda|terça|quarta|quinta|sexta|sábado|domingo|o fim de semana)|esta semana|nesta semana|neste mês|até o dia \d+|terminar|finalizar|entregar|concluir|fazer matrícula|me matricular|atingir|alcançar)\b/i
const context=/\b(quando|durante|depois que|antes de|na reunião|no trabalho|em casa|na faculdade|na aula|na conversa|aconteceu|ontem|hoje de manhã|hoje à tarde|hoje à noite)\b/i

function currentPath(){return window.location.hash.replace(/^#/,'').split('?')[0]||'/'}
function uid(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}
function statusFor(category:Category,text:string){
  if(category==='valor')return valueExplicit.test(text)?'explícito':'candidato'
  if(category==='meta')return realized.test(text)?'concluída':planned.test(text)||goal.test(text)?'planejada':'não determinada'
  if(category==='acao_realizada')return 'realizada'
  if(category==='acao_comprometida')return notRealized.test(text)?'não realizada':partial.test(text)?'parcialmente realizada':realized.test(text)?'realizada':planned.test(text)?'planejada':'não determinada'
  return 'registrado'
}
function classifySegment(text:string):Row{
  const t=text.trim()
  let category:Category='nao_classificavel',confidence:Confidence='baixa',justification='O trecho não contém marcador suficientemente específico para uma classificação segura.'
  if(valueExplicit.test(t)){category='valor';confidence='alta';justification='O trecho descreve explicitamente uma direção contínua de como a pessoa quer agir ou estar no mundo.'}
  else if(valueCandidate.test(t)){category='valor';confidence='moderada';justification='Há linguagem de direção pessoal, mas o valor precisa ser confirmado antes de entrar no histórico longitudinal.'}
  else if(reflection.test(t)){category='aprendizado';confidence='alta';justification='O trecho contém linguagem explícita de percepção, aprendizagem ou atualização de entendimento.'}
  else if(internal.test(t)){category='experiencia_interna';confidence='alta';justification='O trecho descreve pensamento, emoção, sensação, impulso ou dificuldade interna.'}
  else if(notRealized.test(t)){category='acao_comprometida';confidence='moderada';justification='O trecho descreve uma ação pretendida ou possível que não foi realizada.'}
  else if(realized.test(t)){category='acao_realizada';confidence='alta';justification='O trecho usa linguagem que indica um comportamento efetivamente realizado.'}
  else if(goal.test(t)){category='meta';confidence='moderada';justification='O trecho contém um resultado delimitado, prazo ou condição de conclusão.'}
  else if(planned.test(t)){category='acao_comprometida';confidence='alta';justification='O trecho descreve uma ação futura concreta ou um compromisso comportamental.'}
  else if(context.test(t)){category='contexto';confidence='moderada';justification='O trecho descreve principalmente uma situação, momento ou acontecimento externo.'}
  return{id:uid(),category,text:t,description:t.slice(0,140),area:'',valueRelated:'',goalRelated:'',status:statusFor(category,t),confidence,justification}
}
function splitText(text:string){
  return text
    .replace(/([.!?])\s+/g,'$1\n')
    .split(/\n+/)
    .flatMap(s=>s.split(/\s+(?:mas|porém|então|e depois)\s+/i))
    .map(s=>s.trim())
    .filter(s=>s.length>=3)
    .slice(0,120)
}
function classifyText(text:string){return splitText(text).map(classifySegment)}
function statusOptions(category:Category){return category==='valor'?VALUE_STATUS:category==='meta'?GOAL_STATUS:category==='acao_comprometida'||category==='acao_realizada'?ACTION_STATUS:OTHER_STATUS}
function textsFromRecord(r:DbRecord){
  const p=r.payload||{}
  if(r.record_type==='value'&&p.subtype==='act_commitment')return []
  if(r.record_type==='review')return Object.values(p.answers||{}).filter(v=>typeof v==='string'&&v.trim()) as string[]
  const fields:Record<string,string[]>={
    checkin:['event','notes'],relation:['context','observed','inferred','assumption','alternatives'],experiment:['situation','prediction','anticipatedEmotion','actual','observedEmotion','learning'],value:['value','behavior','action'],reflection:['thought','action']
  }
  return (fields[r.record_type]||[]).map(k=>p[k]).filter(v=>typeof v==='string'&&v.trim())
}
function norm(s:string){return s.trim().toLocaleLowerCase('pt-BR')}

export default function ActTracker(){
  const[path,setPath]=useState(currentPath())
  const[target,setTarget]=useState<HTMLElement|null>(null)
  const[text,setText]=useState('')
  const[rows,setRows]=useState<Row[]>([])
  const[records,setRecords]=useState<DbRecord[]>([])
  const[loading,setLoading]=useState(false)
  const[saving,setSaving]=useState(false)
  const[source,setSource]=useState<'manual'|'plataforma'>('manual')

  const active=path==='/compromissos'
  const load=async()=>{
    const{data,error}=await supabase.from('nexo_records').select('id,record_type,payload,created_at').order('created_at',{ascending:true})
    if(error)throw error
    setRecords((data||[]) as DbRecord[])
  }
  useEffect(()=>{load().catch(console.error)},[])
  useEffect(()=>{const onHash=()=>setPath(currentPath());window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[])
  useEffect(()=>{
    let cancelled=false
    const place=()=>{
      if(cancelled)return
      const nav=document.querySelector('.app aside nav')
      if(nav){
        let link=document.getElementById('nexo-act-nav') as HTMLAnchorElement|null
        if(!link){
          link=document.createElement('a');link.id='nexo-act-nav';link.href='#/compromissos';link.textContent='Compromissos'
          const values=[...nav.querySelectorAll('a')].find(a=>a.textContent==='Valores')
          values?.insertAdjacentElement('afterend',link)
          if(!values)nav.appendChild(link)
        }
        link.classList.toggle('active',active)
      }
      document.documentElement.classList.toggle('act-route',active)
      document.getElementById('nexo-act-anchor')?.remove()
      if(active){
        const main=document.querySelector('.app main')
        if(!main){requestAnimationFrame(place);return}
        const anchor=document.createElement('div');anchor.id='nexo-act-anchor'
        const footer=main.querySelector('footer');footer?main.insertBefore(anchor,footer):main.appendChild(anchor)
        setTarget(anchor)
      }else setTarget(null)
    }
    requestAnimationFrame(place)
    return()=>{cancelled=true;document.documentElement.classList.remove('act-route');document.getElementById('nexo-act-anchor')?.remove();document.getElementById('nexo-act-nav')?.classList.remove('active')}
  },[active])

  const previousConfirmed=useMemo(()=>{
    const values=new Map<string,string>()
    records.forEach(r=>{
      const p=r.payload||{}
      if(r.record_type==='value'&&p.subtype!=='act_commitment'&&typeof p.value==='string'&&p.value.trim())values.set(norm(p.value),p.value.trim())
      if(r.record_type==='value'&&p.subtype==='act_commitment')for(const item of p.items||[])if(item.category==='valor'&&item.status==='confirmado'&&item.text)values.set(norm(item.text),item.text)
    })
    return [...values.values()]
  },[records])
  const currentConfirmed=rows.filter(r=>r.category==='valor'&&r.status==='confirmado').map(r=>r.text)
  const confirmedValues=[...new Map([...previousConfirmed,...currentConfirmed].map(v=>[norm(v),v])).values()]
  const currentGoals=rows.filter(r=>r.category==='meta').map(r=>r.text)

  const analyses=records.filter(r=>r.record_type==='value'&&r.payload?.subtype==='act_commitment')
  const metrics=useMemo(()=>{
    const now=Date.now(),cut=now-30*86400000
    const recent=analyses.filter(r=>new Date(r.created_at).getTime()>=cut)
    const allItems=recent.flatMap(r=>r.payload?.items||[])
    const values=new Set(allItems.filter((x:any)=>x.category==='valor'&&x.status==='confirmado').map((x:any)=>norm(x.text||'')))
    previousConfirmed.forEach(v=>values.add(norm(v)))
    const goals=allItems.filter((x:any)=>x.category==='meta').length
    const actions=allItems.filter((x:any)=>['acao_comprometida','acao_realizada'].includes(x.category)&&x.valueRelated)
    const realizedActions=actions.filter((x:any)=>x.category==='acao_realizada'||x.status==='realizada').length
    const plannedActions=actions.filter((x:any)=>x.status==='planejada').length
    const ratio=actions.length?realizedActions/actions.length:NaN
    return{values:values.size,goals,actions:actions.length,realizedActions,plannedActions,ratio}
  },[analyses,previousConfirmed])
  const months=useMemo(()=>{
    const map=new Map<string,{actions:number;realized:number;goals:number}>()
    analyses.forEach(r=>{
      const k=r.created_at.slice(0,7),m=map.get(k)||{actions:0,realized:0,goals:0}
      for(const x of r.payload?.items||[]){
        if(x.category==='meta')m.goals++
        if(['acao_comprometida','acao_realizada'].includes(x.category)&&x.valueRelated){m.actions++;if(x.category==='acao_realizada'||x.status==='realizada')m.realized++}
      }
      map.set(k,m)
    })
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-6)
  },[analyses])

  const analyze=()=>{if(!text.trim())return;setRows(classifyText(text));setSource('manual')}
  const usePlatform=()=>{
    const cutoff=Date.now()-90*86400000
    const parts=records.filter(r=>new Date(r.created_at).getTime()>=cutoff).flatMap(textsFromRecord)
    const joined=parts.join('\n').slice(0,25000)
    setText(joined);setRows(classifyText(joined));setSource('plataforma')
  }
  const update=(id:string,patch:Partial<Row>)=>setRows(rs=>rs.map(r=>r.id===id?{...r,...patch}:r))
  const remove=(id:string)=>setRows(rs=>rs.filter(r=>r.id!==id))
  const save=async()=>{
    if(!rows.length)return
    setSaving(true)
    try{
      const{data:{user},error:userError}=await supabase.auth.getUser();if(userError||!user)throw userError||new Error('Sessão inválida.')
      const items=rows.map(r=>({...r,valueRelated:confirmedValues.some(v=>norm(v)===norm(r.valueRelated))?r.valueRelated:'',goalRelated:r.goalRelated||''}))
      const pending=items.filter(r=>r.category==='valor'&&r.status!=='confirmado').length
      const payload={version:'1.0',subtype:'act_commitment',source,sourceText:text.slice(0,30000),items,needsUserConfirmation:pending>0,confirmationQuestion:pending?`Há ${pending} valor(es) ainda não confirmado(s). Revise-os antes de usá-los como referência longitudinal.`:null}
      const bytes=new TextEncoder().encode(JSON.stringify(payload)).length;if(bytes>100000)throw new Error('A análise excede o limite seguro de 100 KB. Reduza o texto.')
      const{error}=await supabase.from('nexo_records').insert({user_id:user.id,record_type:'value',payload});if(error)throw error
      await load();alert(pending?'Análise salva. Valores não confirmados ficaram fora das métricas de compromisso.':'Análise revisada salva no seu histórico.');setRows([]);setText('')
    }catch(e:any){alert(e.message||'Não foi possível salvar a análise.')}finally{setSaving(false)}
  }

  if(!active||!target)return null
  return createPortal(<>
    <div className="eyebrow">ACT · valor ≠ meta ≠ ação</div><h1>Valores e compromissos</h1>
    <section className="act-guide" aria-label="Como interpretar Valores e compromissos">
      <div><b>O que acompanha</b><p>Separa relatos em valor, meta, ação comprometida, ação realizada, experiência interna, contexto, aprendizado ou não classificável.</p></div>
      <div><b>Requisito</b><p>A pré-classificação precisa ser revisada. Valores candidatos só entram nas métricas depois de você mudar o status para <b>confirmado</b>.</p></div>
      <div><b>Resultado produzido</b><p>Histórico de valores confirmados, metas e ações vinculadas a valores. Mostra quantas ações registradas foram realizadas nos últimos 30 dias.</p></div>
      <div><b>Limite</b><p>É um indicador descritivo de comportamento registrado. Não mede saúde mental, qualidade moral dos valores ou eficácia de psicoterapia.</p></div>
    </section>

    <div className="grid act-summary">
      <div className="card"><b>{metrics.values}</b><small> valores confirmados / ativos</small></div>
      <div className="card"><b>{metrics.goals}</b><small> metas registradas em 30 dias</small></div>
      <div className="card"><b>{metrics.actions}</b><small> ações ligadas a valores em 30 dias</small></div>
      <div className="card"><b>{Number.isFinite(metrics.ratio)?`${Math.round(metrics.ratio*100)}%`:'—'}</b><small> realizadas entre ações registradas com valor</small></div>
    </div>
    <p className="method-note">A proporção acima não é um escore de “aderência a valores”. Ela apenas descreve os registros classificados como ações vinculadas a valores confirmados.</p>

    <div className="card form act-input"><h3>Classificar um relato</h3><p>Cole um relato novo ou carregue textos qualitativos dos últimos 90 dias. A classificação ocorre no navegador e deve ser revisada antes de salvar.</p><label>Relato<textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Ex.: Fiquei ansiosa antes da conversa, mas liguei para minha irmã. Quero ser mais presente nas minhas relações. Nesta semana vou combinar um almoço com ela."/></label><div className="act-actions"><button className="primary" onClick={analyze} disabled={!text.trim()}>Pré-classificar texto</button><button className="secondary" onClick={usePlatform} disabled={!records.length||loading}>{loading?'Carregando...':'Usar relatos recentes da plataforma'}</button></div></div>

    {rows.length>0&&<section><div className="act-review-title"><div><div className="eyebrow">revisão humana obrigatória</div><h2>Revise antes de salvar</h2></div><span className="evidence-badge">{rows.length} trecho(s)</span></div>{rows.map(r=><article className="card act-row" key={r.id}><div className="act-row-top"><b>{r.text}</b><button className="act-remove" onClick={()=>remove(r.id)} aria-label="Remover trecho">×</button></div><div className="act-edit-grid"><label>Categoria<select value={r.category} onChange={e=>{const category=e.target.value as Category;update(r.id,{category,status:statusFor(category,r.text)})}}>{(Object.keys(CATEGORY_LABELS) as Category[]).map(k=><option value={k} key={k}>{CATEGORY_LABELS[k]}</option>)}</select></label><label>Status<select value={r.status} onChange={e=>update(r.id,{status:e.target.value})}>{statusOptions(r.category).map(s=><option key={s}>{s}</option>)}</select></label><label>Área da vida<select value={r.area} onChange={e=>update(r.id,{area:e.target.value})}>{AREAS.map(a=><option key={a} value={a}>{a||'Não definida'}</option>)}</select></label>{['meta','acao_comprometida','acao_realizada'].includes(r.category)&&<label>Valor relacionado<select value={r.valueRelated} onChange={e=>update(r.id,{valueRelated:e.target.value})}><option value="">Sem vínculo confirmado</option>{confirmedValues.map(v=><option key={v}>{v}</option>)}</select></label>}{['acao_comprometida','acao_realizada'].includes(r.category)&&<label>Meta relacionada<select value={r.goalRelated} onChange={e=>update(r.id,{goalRelated:e.target.value})}><option value="">Sem meta relacionada</option>{currentGoals.map(g=><option key={g}>{g}</option>)}</select></label>}</div><p className="act-why"><b>Confiança:</b> {r.confidence}. {r.justification}</p>{r.category==='valor'&&r.status!=='confirmado'&&<div className="act-confirm"><span>Este valor ainda não entra nas métricas longitudinais.</span><button className="primary" onClick={()=>update(r.id,{status:'confirmado'})}>Confirmar como meu valor</button></div>}</article>)}<button className="primary" disabled={saving} onClick={save}>{saving?'Salvando...':'Salvar análise revisada'}</button></section>}

    <section className="section"><div className="eyebrow">evolução longitudinal</div><h2>Valores confirmados</h2>{confirmedValues.length?<div className="act-values">{confirmedValues.map(v=><span key={v}>{v}</span>)}</div>:<div className="card"><p>Ainda não há valores confirmados. Valores candidatos não entram nesta lista até sua confirmação.</p></div>}
      <h2>Últimos meses</h2>{months.length?<div className="card act-months">{months.map(([month,m])=><div key={month}><b>{month}</b><span>{m.goals} meta(s)</span><span>{m.actions} ação(ões) com valor</span><span>{m.realized} realizada(s)</span></div>)}</div>:<div className="card"><p>Salve análises revisadas para acompanhar a evolução entre meses.</p></div>}
    </section>
    <div className="card caution"><h3>Como interpretar</h3><p>Na ACT, valores são direções contínuas e não “metas concluídas”. Uma ação pode estar alinhada a um valor mesmo quando ansiedade, tristeza, medo ou outro desconforto estiver presente. O Nexo não considera maior quantidade de metas ou ações como evidência automática de maior saúde psicológica.</p></div>
  </>,target)
}
