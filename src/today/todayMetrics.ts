import type {ConfirmedValue,Domain,DomainComparison,ExperimentSummary,RawRecord,RelationSummary,TodayInsight,ValueActionConsistency} from './todayTypes'

export const ABSOLUTE_CHANGE_THRESHOLD=0.30
export const MIN_BASELINE_OBSERVATIONS=3
export const MIN_RELATION_ASSOCIATION_N=5
export const THIRTY_DAYS_MS=30*86400000

export const DOMAINS:Domain[]=['Autorregulação','Flexibilidade','Socioemocional','Relações','Metacognição']
export const DOMAIN_ITEMS:Record<Domain,string[]>={
  Autorregulação:['ar1','ar2','ar3'],
  Flexibilidade:['fx1','fx2','fx3'],
  Socioemocional:['se1','se2','se3'],
  Relações:['re1','re2','re3'],
  Metacognição:['mc1','mc2','mc3'],
}

const RELATION_LABELS:Record<string,string>={quality:'qualidade',presence:'presença',listening:'escuta',assertiveness:'assertividade',empathy:'empatia',boundaries:'limites',connectionAfter:'conexão posterior'}
const RELATION_KEYS=Object.keys(RELATION_LABELS)

export function isObject(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)}
export function finiteNumber(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)?value:null}
export function nonEmptyString(value:unknown):string{return typeof value==='string'?value.trim():''}
export function normalizeText(value:string){return value.trim().toLocaleLowerCase('pt-BR')}
export function safeMean(values:number[]):number|null{return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null}

export function calculateDomainScore(payload:unknown,domain:Domain):number|null{
  if(!isObject(payload)||!isObject(payload.responses))return null
  const values=DOMAIN_ITEMS[domain].map(id=>finiteNumber(payload.responses?.[id])).filter((value):value is number=>value!==null)
  return values.length===DOMAIN_ITEMS[domain].length?safeMean(values):null
}

export function classifyPersonalChange(difference:number|null):DomainComparison['change']{
  if(difference===null||!Number.isFinite(difference))return'insufficient-data'
  if(Math.abs(difference)<ABSOLUTE_CHANGE_THRESHOLD)return'within'
  return difference<0?'below':'above'
}

export function calculatePersonalBaseline(checkins:RawRecord[],current:RawRecord,domain:Domain):DomainComparison{
  const currentScore=calculateDomainScore(current.payload,domain)
  const currentTime=new Date(current.created_at).getTime()
  const prior=checkins.filter(record=>record.id!==current.id).filter(record=>{
    const time=new Date(record.created_at).getTime()
    return Number.isFinite(time)&&time<currentTime&&time>=currentTime-THIRTY_DAYS_MS
  })
  const scores=prior.map(record=>calculateDomainScore(record.payload,domain)).filter((value):value is number=>value!==null)
  if(currentScore===null||scores.length<MIN_BASELINE_OBSERVATIONS){return{domain,current:currentScore,baseline:null,baselineN:scores.length,difference:null,change:'insufficient-data'}}
  const baseline=safeMean(scores)
  const difference=baseline===null?null:currentScore-baseline
  return{domain,current:currentScore,baseline,baselineN:scores.length,difference,change:classifyPersonalChange(difference)}
}

export function calculateAllDomainComparisons(checkins:RawRecord[],current:RawRecord):DomainComparison[]{
  return DOMAINS.map(domain=>calculatePersonalBaseline(checkins,current,domain))
}

function confirmedValuesFromRecords(records:RawRecord[]):ConfirmedValue[]{
  const values=new Map<string,ConfirmedValue>()
  for(const record of records){
    if(record.record_type!=='value'||!isObject(record.payload))continue
    const subtype=nonEmptyString(record.payload.subtype)
    if(subtype!=='act_commitment'){
      const text=nonEmptyString(record.payload.value)
      if(text){const key=normalizeText(text);values.set(key,{key,text,area:nonEmptyString(record.payload.area)})}
      continue
    }
    const items=Array.isArray(record.payload.items)?record.payload.items:[]
    for(const item of items){
      if(!isObject(item)||nonEmptyString(item.category)!=='valor'||nonEmptyString(item.status)!=='confirmado')continue
      const text=nonEmptyString(item.text)
      if(!text)continue
      const key=normalizeText(text)
      values.set(key,{key,text,area:nonEmptyString(item.area)})
    }
  }
  return[...values.values()]
}

export function calculateValueActionConsistency(records:RawRecord[],nowMs=Date.now()):ValueActionConsistency{
  const confirmedValues=confirmedValuesFromRecords(records)
  const confirmedKeys=new Set(confirmedValues.map(value=>value.key))
  const actions=[] as ValueActionConsistency['latestAction'][]
  const validActions:{text:string;value:string;status:string;realized:boolean;createdAt:string}[]=[]
  for(const record of records){
    if(record.record_type!=='value'||!isObject(record.payload)||nonEmptyString(record.payload.subtype)!=='act_commitment')continue
    const recordTime=new Date(record.created_at).getTime()
    if(!Number.isFinite(recordTime)||recordTime<nowMs-THIRTY_DAYS_MS||recordTime>nowMs)continue
    const items=Array.isArray(record.payload.items)?record.payload.items:[]
    for(const item of items){
      if(!isObject(item))continue
      const category=nonEmptyString(item.category)
      if(category!=='acao_comprometida'&&category!=='acao_realizada')continue
      const value=nonEmptyString(item.valueRelated)
      if(!value||!confirmedKeys.has(normalizeText(value)))continue
      const status=nonEmptyString(item.status)||'não determinada'
      validActions.push({text:nonEmptyString(item.text),value,status,realized:category==='acao_realizada'||status==='realizada',createdAt:record.created_at})
    }
  }
  void actions
  validActions.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime())
  const realized=validActions.filter(action=>action.realized).length
  return{confirmedValues,actions:validActions.length,realized,ratio:validActions.length?realized/validActions.length:null,latestAction:validActions.at(-1)??null}
}

export function summarizeExperiments(records:RawRecord[]):ExperimentSummary{
  const complete=[] as {anticipated:number;observed:number;difference:number;certainty:number|null;createdAt:string}[]
  for(const record of records){
    if(record.record_type!=='experiment'||!isObject(record.payload))continue
    const anticipated=finiteNumber(record.payload.anticipatedIntensity)
    const observed=finiteNumber(record.payload.observedIntensity)
    const hasBefore=[record.payload.situation,record.payload.prediction,record.payload.anticipatedEmotion].some(value=>Boolean(nonEmptyString(value)))
    const hasAfter=[record.payload.actual,record.payload.observedEmotion,record.payload.learning].some(value=>Boolean(nonEmptyString(value)))
    if(anticipated===null||observed===null||!hasBefore||!hasAfter)continue
    complete.push({anticipated,observed,difference:observed-anticipated,certainty:finiteNumber(record.payload.certainty),createdAt:record.created_at})
  }
  complete.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime())
  return{
    complete:complete.length,
    observedLower:complete.filter(item=>item.difference<0).length,
    observedEqual:complete.filter(item=>item.difference===0).length,
    observedHigher:complete.filter(item=>item.difference>0).length,
    latest:complete.at(-1)??null,
  }
}

function standardDeviation(values:number[]):number|null{
  if(values.length<2)return null
  const mean=safeMean(values)
  if(mean===null)return null
  return Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/(values.length-1))
}

function pearson(x:number[],y:number[]):number|null{
  if(x.length!==y.length||x.length<2)return null
  const mx=safeMean(x),my=safeMean(y)
  if(mx===null||my===null)return null
  let numerator=0,dx=0,dy=0
  for(let i=0;i<x.length;i++){const a=x[i]-mx,b=y[i]-my;numerator+=a*b;dx+=a*a;dy+=b*b}
  const denominator=Math.sqrt(dx*dy)
  return denominator?numerator/denominator:null
}

export function summarizeRelations(records:RawRecord[]):RelationSummary{
  const rows=records.filter(record=>record.record_type==='relation'&&isObject(record.payload))
  if(rows.length<3)return{n:rows.length,mostVariable:null,mostStable:null,presenceConnectionCorrelation:null}
  const variability=RELATION_KEYS.map(key=>{
    const values=rows.map(record=>isObject(record.payload)?finiteNumber(record.payload[key]):null).filter((value):value is number=>value!==null)
    return{key,sd:standardDeviation(values)}
  }).filter((entry):entry is {key:string;sd:number}=>entry.sd!==null)
  variability.sort((a,b)=>a.sd-b.sd)
  let correlation:number|null=null
  if(rows.length>=MIN_RELATION_ASSOCIATION_N){
    const pairs=rows.map(record=>{
      if(!isObject(record.payload))return null
      const presence=finiteNumber(record.payload.presence),connection=finiteNumber(record.payload.connectionAfter)
      return presence===null||connection===null?null:[presence,connection] as const
    }).filter((pair):pair is readonly[number,number]=>pair!==null)
    if(pairs.length>=MIN_RELATION_ASSOCIATION_N)correlation=pearson(pairs.map(pair=>pair[0]),pairs.map(pair=>pair[1]))
  }
  return{n:rows.length,mostVariable:variability.at(-1)?RELATION_LABELS[variability.at(-1)!.key]:null,mostStable:variability[0]?RELATION_LABELS[variability[0].key]:null,presenceConnectionCorrelation:correlation}
}

const ROUTE_BY_DOMAIN:Record<Domain,{route:string;actionLabel:string}>={
  Autorregulação:{route:'/reflexao',actionLabel:'Registrar reflexão'},
  Flexibilidade:{route:'/compromissos',actionLabel:'Ver compromissos'},
  Socioemocional:{route:'/revisao',actionLabel:'Abrir revisão'},
  Relações:{route:'/relacoes',actionLabel:'Revisar relações'},
  Metacognição:{route:'/reflexao',actionLabel:'Explorar reflexão'},
}

const DETAIL_BY_DOMAIN:Record<Domain,string>={
  Autorregulação:'Os três itens de iniciar, ajustar estratégia e interromper análise repetitiva ficaram abaixo da sua média pessoal recente.',
  Flexibilidade:'Os itens de permitir desconforto, observar pensamentos como pensamentos e agir em direção ao que valoriza ficaram abaixo da sua média pessoal recente.',
  Socioemocional:'Os itens de regulação da resposta, adaptação e curiosidade ficaram abaixo da sua média pessoal recente.',
  Relações:'Os itens de escuta, expressão de necessidades ou limites e menor antecipação da reação alheia ficaram abaixo da sua média pessoal recente.',
  Metacognição:'Os itens de questionar pressupostos, distinguir observação de interpretação e considerar alternativas ficaram abaixo da sua média pessoal recente.',
}

export function chooseTodayAttention(comparisons:DomainComparison[]):TodayInsight[]{
  return comparisons.filter(comparison=>comparison.change==='below'&&comparison.difference!==null).sort((a,b)=>(a.difference??0)-(b.difference??0)).slice(0,2).map(comparison=>({
    domain:comparison.domain,
    title:`${comparison.domain} apareceu abaixo do seu padrão recente.`,
    detail:DETAIL_BY_DOMAIN[comparison.domain],
    route:ROUTE_BY_DOMAIN[comparison.domain].route,
    actionLabel:ROUTE_BY_DOMAIN[comparison.domain].actionLabel,
    comparison,
  }))
}

export function choosePositiveDomains(comparisons:DomainComparison[]):DomainComparison[]{
  return comparisons.filter(comparison=>comparison.change==='above'&&comparison.difference!==null).sort((a,b)=>(b.difference??0)-(a.difference??0)).slice(0,2)
}

export function questionForToday(primary:TodayInsight|undefined,hasConfirmedValues:boolean){
  if(primary){
    const map:Record<Domain,{question:string;route:string;label:string}>={
      Autorregulação:{question:'Qual é a menor ação concreta que posso iniciar agora?',route:'/reflexao',label:'Registrar reflexão'},
      Flexibilidade:{question:'É possível permitir a presença dessa experiência e ainda escolher uma ação coerente com algo que valorizo?',route:'/compromissos',label:'Ver compromissos'},
      Socioemocional:{question:'O que posso observar na minha resposta antes de escolher a próxima ação?',route:'/revisao',label:'Abrir revisão'},
      Relações:{question:'O que observei diretamente nessa interação e o que estou inferindo?',route:'/relacoes',label:'Registrar relação'},
      Metacognição:{question:'Que parte do que estou concluindo é observação e que parte é interpretação?',route:'/reflexao',label:'Registrar reflexão'},
    }
    return map[primary.domain]
  }
  if(hasConfirmedValues)return{question:'Qual pequena ação hoje expressaria um valor que já confirmei como importante?',route:'/compromissos',label:'Ver compromissos'}
  return{question:'Qual dado do meu dia merece ser observado antes de eu tirar uma conclusão?',route:'/checkin',label:'Fazer check-in'}
}

export function selectTrajectoryCheckins(checkins:RawRecord[],mode:'7'|'30'|'90',nowMs=Date.now()):RawRecord[]{
  if(mode==='7')return checkins.slice(-7)
  const days=mode==='30'?30:90
  const cutoff=nowMs-days*86400000
  return checkins.filter(record=>new Date(record.created_at).getTime()>=cutoff)
}
