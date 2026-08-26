import{describe,expect,it}from'vitest'
import type{RawRecord}from'../today/todayTypes'
import{normalizeWearableRow,parseWearableText,summarizeWearable}from'./wearableMetrics'

function record(id:string,date:string,payload:Record<string,unknown>):RawRecord{return{id,record_type:'review',created_at:`${date}T12:00:00Z`,payload:{version:'1.0',subtype:'wearable_daily',date,source:'Garmin',...payload}}}

describe('wearable import',()=>{
  it('parses CSV sleep, stress and resting bpm',()=>{
    const rows=parseWearableText('date,sleep_minutes,stress_score,resting_heart_rate\n2026-08-20,420,38,62','Garmin')
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({date:'2026-08-20',sleepMinutes:420,stressScore:38,restingBpm:62,source:'Garmin',stressOrientation:'higher-is-more-stress'})
  })
  it('converts sleep hours to minutes',()=>{expect(normalizeWearableRow({date:'20/08/2026',sleep_hours:'7,5'},'Relógio')?.sleepMinutes).toBe(450)})
  it('recognizes stress management scores as higher-is-better',()=>{expect(normalizeWearableRow({date:'2026-08-20',stress_management_score:72},'Fitbit')?.stressOrientation).toBe('higher-is-better')})
  it('drops impossible physiological values',()=>{const row=normalizeWearableRow({date:'2026-08-20',sleep_minutes:1800,stress:140,resting_bpm:400,average_bpm:75},'Teste');expect(row).toMatchObject({averageBpm:75});expect(row?.sleepMinutes).toBeUndefined();expect(row?.stressScore).toBeUndefined();expect(row?.restingBpm).toBeUndefined()})
  it('deduplicates same source and date inside one import',()=>{const rows=parseWearableText(JSON.stringify([{date:'2026-08-20',sleep_minutes:400},{date:'2026-08-20',sleep_minutes:430}]),'Garmin');expect(rows).toHaveLength(1);expect(rows[0].sleepMinutes).toBe(430)})
})

describe('wearable longitudinal summary',()=>{
  const baseline=[1,2,3,4,5].map(day=>record(String(day),`2026-08-0${day}`,{sleepMinutes:450,stressScore:30,stressOrientation:'higher-is-more-stress',restingBpm:60}))
  it('requires five prior observations per metric',()=>{const summary=summarizeWearable([...baseline.slice(0,4),record('x','2026-08-10',{sleepMinutes:380})],'2026-08-10');expect(summary.sleep.signal).toBe('insufficient');expect(summary.sleep.baselineN).toBe(4)})
  it('flags sleep meaningfully below personal baseline',()=>{const summary=summarizeWearable([...baseline,record('x','2026-08-10',{sleepMinutes:390})],'2026-08-10');expect(summary.lowerSleep).toBe(true);expect(summary.shouldReduceLoad).toBe(true)})
  it('flags stress above personal baseline when higher means more stress',()=>{const summary=summarizeWearable([...baseline,record('x','2026-08-10',{stressScore:45,stressOrientation:'higher-is-more-stress'})],'2026-08-10');expect(summary.higherStressBurden).toBe(true)})
  it('flags lower stress-management score when higher means better',()=>{const prior=[1,2,3,4,5].map(day=>record(String(day),`2026-08-0${day}`,{stressScore:80,stressOrientation:'higher-is-better'}));const summary=summarizeWearable([...prior,record('x','2026-08-10',{stressScore:65,stressOrientation:'higher-is-better'})],'2026-08-10');expect(summary.higherStressBurden).toBe(true)})
  it('flags resting bpm above personal baseline without using it alone to reduce practice load',()=>{const summary=summarizeWearable([...baseline,record('x','2026-08-10',{restingBpm:70})],'2026-08-10');expect(summary.higherRestingBpm).toBe(true);expect(summary.shouldReduceLoad).toBe(false)})
  it('does not mix baselines from another source',()=>{const other=[1,2,3,4,5].map(day=>({id:`s${day}`,record_type:'review',created_at:`2026-08-0${day}T12:00:00Z`,payload:{version:'1.0',subtype:'wearable_daily',date:`2026-08-0${day}`,source:'Samsung',sleepMinutes:200}} as RawRecord));const summary=summarizeWearable([...other,...baseline,record('x','2026-08-10',{sleepMinutes:390})],'2026-08-10');expect(summary.sleep.baseline).toBe(450)})
  it('marks wearable context stale after more than two days',()=>{const summary=summarizeWearable([...baseline,record('x','2026-08-10',{sleepMinutes:390})],'2026-08-14');expect(summary.fresh).toBe(false);expect(summary.shouldReduceLoad).toBe(false)})
})
