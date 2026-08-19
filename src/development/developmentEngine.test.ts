import {describe,expect,it} from 'vitest'
import type {RawRecord} from '../today/todayTypes'
import {PRACTICES} from './practiceCatalog'
import {availablePracticeIds,buildDevelopmentPlan,getPendingPractice,getPracticeStats} from './developmentEngine'

const NOW=new Date('2026-08-19T12:00:00Z').getTime()

function rec(id:string,record_type:string,created_at:string,payload:unknown):RawRecord{return{id,record_type,created_at,payload}}

const ids={
  Autorregulação:['ar1','ar2','ar3'],
  Flexibilidade:['fx1','fx2','fx3'],
  Socioemocional:['se1','se2','se3'],
  Relações:['re1','re2','re3'],
  Metacognição:['mc1','mc2','mc3'],
} as const

function checkin(id:string,date:string,scores:Partial<Record<keyof typeof ids,number>>,context:{energy?:number;stress?:number}={}){
  const responses:Record<string,number>={}
  for(const[domain,itemIds]of Object.entries(ids))for(const itemId of itemIds)responses[itemId]=scores[domain as keyof typeof ids]??4
  return rec(id,'checkin',`${date}T12:00:00Z`,{responses,energy:context.energy??5,stress:context.stress??5,connection:5,sleep:5})
}

function relation(id:string,date:string,quality:number,extra:Record<string,unknown>={}){
  return rec(id,'relation',`${date}T12:00:00Z`,{quality,presence:7,listening:7,assertiveness:7,empathy:7,boundaries:7,connectionAfter:7,observed:'fato observado',inferred:'',assumption:'',alternatives:'',...extra})
}

function dev(id:string,date:string,payload:Record<string,unknown>){
  return rec(id,'review',`${date}T12:00:00Z`,{version:'1.0',subtype:'development_practice',assignmentId:`a-${id}`,scope:'daily',skill:'communication.clarity',practiceId:'communication-one-sentence-purpose',...payload})
}

function relationClaritySeries(){
  return[
    relation('r1','2026-08-10',8),relation('r2','2026-08-11',8),relation('r3','2026-08-12',8),
    relation('r4','2026-08-16',5,{context:'Não fui clara na conversa'}),
    relation('r5','2026-08-17',5,{context:'Não fui clara ao explicar'}),
    relation('r6','2026-08-18',5),
  ]
}

describe('development engine',()=>{
  it('não transforma missing em zero',()=>{
    const records=[
      checkin('c1','2026-08-10',{Autorregulação:4}),
      checkin('c2','2026-08-11',{Autorregulação:4}),
      checkin('c3','2026-08-12',{Autorregulação:4}),
      checkin('c4','2026-08-18',{Autorregulação:2}),
    ]
    const latest=records[3]
    if(typeof latest.payload==='object'&&latest.payload!==null&&'responses'in latest.payload){
      delete (latest.payload as {responses:Record<string,number>}).responses.ar3
    }
    const plan=buildDevelopmentPlan(records,NOW)
    expect(plan.candidates.some(candidate=>candidate.skill==='self.start_action')).toBe(false)
  })

  it('não gera recomendação personalizada com histórico insuficiente',()=>{
    const plan=buildDevelopmentPlan([
      checkin('c1','2026-08-17',{Autorregulação:4}),
      checkin('c2','2026-08-18',{Autorregulação:1}),
    ],NOW)
    expect(plan.daily).toBeNull()
  })

  it('uma única observação qualitativa não vira padrão personalizado',()=>{
    const plan=buildDevelopmentPlan([
      relation('r1','2026-08-18',6,{observed:'',inferred:'Acho que ela ficou irritada comigo',alternatives:''}),
    ],NOW)
    expect(plan.daily).toBeNull()
  })

  it('valor candidato não é tratado como confirmado',()=>{
    const plan=buildDevelopmentPlan([
      rec('v1','value','2026-08-18T12:00:00Z',{subtype:'act_commitment',items:[
        {category:'valor',status:'candidato',text:'respeito'},
        {category:'acao_comprometida',status:'planejada',text:'mandar mensagem',valueRelated:'respeito'},
      ]}),
    ],NOW)
    expect(plan.candidates.some(candidate=>candidate.skill==='values.small_action')).toBe(false)
  })

  it('meta recusada não é classificada como realização fracassada',()=>{
    const stats=getPracticeStats([dev('d1','2026-08-18',{phase:'declined'})])
    expect(stats[0].declined).toBe(1)
    expect(stats[0].completed).toBe(0)
    expect(stats[0].partial).toBe(0)
  })

  it('"sem oportunidade" permanece categoria própria',()=>{
    const stats=getPracticeStats([dev('d1','2026-08-18',{phase:'outcome',completion:'no-opportunity',utility:5,effort:1})])
    expect(stats[0].noOpportunity).toBe(1)
    expect(stats[0].completed).toBe(0)
  })

  it('mantém no máximo uma recomendação diária',()=>{
    const plan=buildDevelopmentPlan([
      checkin('c1','2026-08-10',{Autorregulação:4,Metacognição:4}),
      checkin('c2','2026-08-11',{Autorregulação:4,Metacognição:4}),
      checkin('c3','2026-08-12',{Autorregulação:4,Metacognição:4}),
      checkin('c4','2026-08-18',{Autorregulação:2,Metacognição:2}),
    ],NOW)
    expect(Array.isArray(plan.daily)).toBe(false)
  })

  it('mantém no máximo duas metas semanais',()=>{
    const plan=buildDevelopmentPlan([
      checkin('c1','2026-08-10',{Autorregulação:4,Metacognição:4,Relações:4}),
      checkin('c2','2026-08-11',{Autorregulação:4,Metacognição:4,Relações:4}),
      checkin('c3','2026-08-12',{Autorregulação:4,Metacognição:4,Relações:4}),
      checkin('c4','2026-08-18',{Autorregulação:2,Metacognição:2,Relações:2}),
    ],NOW)
    expect(plan.weekly.length).toBeLessThanOrEqual(2)
  })

  it('não expõe prioridade interna como escore na recomendação',()=>{
    const plan=buildDevelopmentPlan(relationClaritySeries(),NOW)
    expect(plan.daily).not.toBeNull()
    expect('priority' in (plan.daily as object)).toBe(false)
  })

  it('energia baixa e estresse alto restringem a carga da prática',()=>{
    const plan=buildDevelopmentPlan([
      checkin('c1','2026-08-10',{Autorregulação:4}),
      checkin('c2','2026-08-11',{Autorregulação:4}),
      checkin('c3','2026-08-12',{Autorregulação:4}),
      checkin('c4','2026-08-18',{Autorregulação:2},{energy:3,stress:8}),
      rec('q1','reflection','2026-08-17T10:00:00Z',{thought:'Continuo pensando nisso de novo e não surgiu informação nova',action:''}),
      rec('q2','reflection','2026-08-18T10:00:00Z',{thought:'A mesma análise e não surgiu informação nova',action:''}),
    ],NOW)
    const recommendations=[plan.daily,...plan.alternatives,...plan.weekly].filter(Boolean)
    expect(recommendations.length).toBeGreaterThan(0)
    for(const recommendation of recommendations){
      expect(recommendation!.practice.difficulty).toBe('low')
      expect(recommendation!.practice.estimatedMinutes).toBeLessThanOrEqual(5)
    }
  })

  it('prática repetidamente pouco útil perde preferência para alternativa',()=>{
    const records=[
      ...relationClaritySeries(),
      dev('d1','2026-08-13',{phase:'outcome',completion:'done',utility:2,effort:7}),
      dev('d2','2026-08-14',{phase:'outcome',completion:'done',utility:3,effort:8}),
    ]
    const plan=buildDevelopmentPlan(records,NOW)
    expect(plan.daily?.skill.id).toBe('communication.clarity')
    expect(plan.daily?.practice.id).toBe('communication-three-points')
  })

  it('prática útil pode reaparecer depois do espaçamento',()=>{
    const records=[
      ...relationClaritySeries(),
      dev('d1','2026-08-10',{phase:'outcome',completion:'done',utility:9,effort:4}),
      dev('d2','2026-08-12',{phase:'outcome',completion:'done',utility:8,effort:4}),
    ]
    const plan=buildDevelopmentPlan(records,NOW)
    expect(plan.daily?.skill.id).toBe('communication.clarity')
    expect(plan.daily?.practice.id).toBe('communication-one-sentence-purpose')
  })

  it('não produz NaN ou Infinity no plano',()=>{
    const plan=buildDevelopmentPlan([
      checkin('c1','2026-08-10',{Autorregulação:4}),
      checkin('c2','2026-08-11',{Autorregulação:4}),
      checkin('c3','2026-08-12',{Autorregulação:4}),
      checkin('c4','2026-08-18',{Autorregulação:2}),
    ],NOW)
    const visit=(value:unknown)=>{
      if(typeof value==='number')expect(Number.isFinite(value)).toBe(true)
      else if(Array.isArray(value))value.forEach(visit)
      else if(value&&typeof value==='object')Object.values(value).forEach(visit)
    }
    visit(plan)
  })

  it('não personaliza recomendação baseada exclusivamente em texto',()=>{
    const records=[
      rec('x1','reflection','2026-08-15T12:00:00Z',{thought:'Continuo pensando nisso de novo e não surgiu informação nova',action:''}),
      rec('x2','reflection','2026-08-16T12:00:00Z',{thought:'A mesma análise e não surgiu informação nova',action:''}),
      rec('x3','reflection','2026-08-17T12:00:00Z',{thought:'Continuo pensando nisso de novo',action:''}),
    ]
    const plan=buildDevelopmentPlan(records,NOW)
    const candidate=plan.candidates.find(item=>item.skill==='self.stop_recursive_analysis')
    expect(candidate?.quantitativeEvidenceCount).toBe(0)
    expect(candidate?.personalized).toBe(false)
    expect(plan.daily).toBeNull()
  })

  it('exige convergência entre tipos de fonte para personalização',()=>{
    const plan=buildDevelopmentPlan([
      checkin('c1','2026-08-10',{Metacognição:4}),
      checkin('c2','2026-08-11',{Metacognição:4}),
      checkin('c3','2026-08-12',{Metacognição:4}),
      checkin('c4','2026-08-18',{Metacognição:2}),
    ],NOW)
    expect(plan.candidates.some(candidate=>candidate.quantitativeEvidenceCount>0)).toBe(true)
    expect(plan.daily).toBeNull()
  })

  it('habilidade recusada entra em cooldown e não é insistida automaticamente',()=>{
    const records=[...relationClaritySeries(),dev('decline','2026-08-18',{phase:'declined'})]
    const plan=buildDevelopmentPlan(records,NOW)
    expect(plan.daily?.skill.id).not.toBe('communication.clarity')
  })

  it('recupera prática aceita sem feedback em uma visita posterior',()=>{
    const accepted=dev('accepted','2026-08-18',{phase:'accepted'})
    const pending=getPendingPractice([accepted],NOW)
    expect(pending?.practiceId).toBe('communication-one-sentence-purpose')
    expect(pending?.scope).toBe('daily')
  })

  it('catálogo é determinístico e não contém endpoint externo',()=>{
    expect(availablePracticeIds().size).toBe(PRACTICES.length)
    expect(PRACTICES.every(practice=>practice.sourceType==='deterministic-template')).toBe(true)
    expect(PRACTICES.some(practice=>/https?:\/\//i.test(`${practice.description} ${practice.weeklyDescription}`))).toBe(false)
  })
})
