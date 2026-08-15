import {describe,expect,it} from 'vitest'
import type {RawRecord} from './todayTypes'
import {ABSOLUTE_CHANGE_THRESHOLD,calculateDomainScore,calculatePersonalBaseline,calculateValueActionConsistency,chooseTodayAttention,classifyPersonalChange,summarizeExperiments,summarizeRelations} from './todayMetrics'

const rec=(id:string,type:string,createdAt:string,payload:unknown):RawRecord=>({id,record_type:type,created_at:createdAt,payload})
const responses=(value:number)=>({ar1:value,ar2:value,ar3:value,fx1:value,fx2:value,fx3:value,se1:value,se2:value,se3:value,re1:value,re2:value,re3:value,mc1:value,mc2:value,mc3:value})
const checkin=(id:string,day:number,value:number)=>rec(id,'checkin',`2026-08-${String(day).padStart(2,'0')}T12:00:00Z`,{responses:responses(value)})

describe('Today domain baseline',()=>{
  it('returns insufficient-data with fewer than 3 prior records',()=>{
    const current=checkin('c3',10,3)
    const result=calculatePersonalBaseline([checkin('c1',8,4),checkin('c2',9,4),current],current,'Autorregulação')
    expect(result.change).toBe('insufficient-data')
    expect(result.baselineN).toBe(2)
  })

  it('excludes the current record from its own baseline',()=>{
    const current=checkin('current',10,2)
    const result=calculatePersonalBaseline([checkin('a',7,4),checkin('b',8,4),checkin('c',9,4),current],current,'Autorregulação')
    expect(result.baseline).toBe(4)
    expect(result.current).toBe(2)
    expect(result.difference).toBe(-2)
  })

  it('does not convert missing items to zero',()=>{
    expect(calculateDomainScore({responses:{ar1:4,ar2:4}},'Autorregulação')).toBeNull()
  })

  it('classifies small differences inside the descriptive tolerance',()=>{
    expect(classifyPersonalChange(ABSOLUTE_CHANGE_THRESHOLD-0.01)).toBe('within')
    expect(classifyPersonalChange(-(ABSOLUTE_CHANGE_THRESHOLD-0.01))).toBe('within')
  })

  it('classifies relevant negative and positive differences',()=>{
    expect(classifyPersonalChange(-0.31)).toBe('below')
    expect(classifyPersonalChange(0.31)).toBe('above')
  })
})

describe('Values and committed actions',()=>{
  const now=new Date('2026-08-15T12:00:00Z').getTime()

  it('does not calculate a ratio when the denominator is zero',()=>{
    const records=[rec('v','value','2026-08-14T12:00:00Z',{value:'Presença',area:'relações'})]
    const result=calculateValueActionConsistency(records,now)
    expect(result.actions).toBe(0)
    expect(result.ratio).toBeNull()
  })

  it('excludes candidate values from confirmed values',()=>{
    const records=[rec('v','value','2026-08-14T12:00:00Z',{subtype:'act_commitment',items:[{category:'valor',status:'candidato',text:'Curiosidade'}]})]
    expect(calculateValueActionConsistency(records,now).confirmedValues).toHaveLength(0)
  })

  it('excludes actions that are not linked to a confirmed value',()=>{
    const records=[rec('x','value','2026-08-14T12:00:00Z',{subtype:'act_commitment',items:[{category:'valor',status:'confirmado',text:'Presença'},{category:'acao_comprometida',status:'realizada',text:'Ouvir com atenção',valueRelated:'Outro valor'}]})]
    expect(calculateValueActionConsistency(records,now).actions).toBe(0)
  })

  it('calculates realized actions only among actions linked to confirmed values',()=>{
    const records=[rec('x','value','2026-08-14T12:00:00Z',{subtype:'act_commitment',items:[{category:'valor',status:'confirmado',text:'Presença'},{category:'acao_comprometida',status:'realizada',text:'Ouvir',valueRelated:'Presença'},{category:'acao_comprometida',status:'planejada',text:'Telefonar',valueRelated:'Presença'}]})]
    const result=calculateValueActionConsistency(records,now)
    expect(result.actions).toBe(2)
    expect(result.realized).toBe(1)
    expect(result.ratio).toBe(0.5)
  })
})

describe('Prediction versus experience',()=>{
  it('excludes experiments without meaningful before and after content',()=>{
    const records=[rec('e','experiment','2026-08-14T12:00:00Z',{anticipatedIntensity:5,observedIntensity:5,prediction:'',actual:''})]
    expect(summarizeExperiments(records).complete).toBe(0)
  })

  it('counts observed intensity lower than predicted',()=>{
    const records=[rec('e','experiment','2026-08-14T12:00:00Z',{anticipatedIntensity:8,observedIntensity:5,prediction:'Será difícil',actual:'Foi manejável'})]
    const result=summarizeExperiments(records)
    expect(result.complete).toBe(1)
    expect(result.observedLower).toBe(1)
    expect(result.latest?.difference).toBe(-3)
  })

  it('counts equal predicted and observed intensity separately',()=>{
    const records=[rec('e','experiment','2026-08-14T12:00:00Z',{anticipatedIntensity:5,observedIntensity:5,prediction:'Previsão',actual:'Resultado'})]
    const result=summarizeExperiments(records)
    expect(result.observedEqual).toBe(1)
    expect(result.observedLower).toBe(0)
  })
})

describe('Relations and insight selection',()=>{
  it('does not estimate relational association below the minimum n',()=>{
    const records=[1,2,3,4].map(i=>rec(`r${i}`,'relation',`2026-08-${10+i}T12:00:00Z`,{presence:i,connectionAfter:i,quality:5,listening:5,assertiveness:5,empathy:5,boundaries:5}))
    expect(summarizeRelations(records).presenceConnectionCorrelation).toBeNull()
  })

  it('never selects more than two attention signals',()=>{
    const current=checkin('current',15,1)
    const priors=[checkin('a',12,4),checkin('b',13,4),checkin('c',14,4)]
    const comparisons=['Autorregulação','Flexibilidade','Socioemocional','Relações','Metacognição'].map(domain=>calculatePersonalBaseline([...priors,current],current,domain as Parameters<typeof calculatePersonalBaseline>[2]))
    expect(chooseTodayAttention(comparisons)).toHaveLength(2)
  })

  it('does not expose NaN or Infinity for missing baseline metrics',()=>{
    const current=checkin('current',15,3)
    const result=calculatePersonalBaseline([current],current,'Metacognição')
    expect(result.baseline).toBeNull()
    expect(result.difference).toBeNull()
    expect(Number.isNaN(result.current)).toBe(false)
  })
})
