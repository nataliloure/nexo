import type{RawRecord}from'../today/todayTypes'
import{finiteNumber,isObject,nonEmptyString,safeMean}from'../today/todayMetrics'
import type{StressOrientation,WearableDailyPayload,WearableMetricSummary,WearableSummary}from'./wearableTypes'

export const WEARABLE_BASELINE_DAYS=30
export const MIN_WEARABLE_BASELINE_N=5
export const MAX_WEARABLE_IMPORT_ROWS=5000

const DAY_MS=86400000
const DATE_KEYS=['date','data','day','calendar_date','calendardate','start_date','startdate']
const SOURCE_KEYS=['source','provider','device','app','platform']
const SLEEP_MINUTE_KEYS=['sleepminutes','sleep_minutes','sleepdurationminutes','sleep_duration_minutes','totalsleepminutes','total_sleep_minutes','minutesasleep','minutes_asleep','totalsleeptime','total_sleep_time']
const SLEEP_HOUR_KEYS=['sleephours','sleep_hours','sleepdurationhours','sleep_duration_hours','sono_horas','duracao_sono_horas']
const STRESS_KEYS=['stress','stressscore','stress_score','avgstress','avg_stress','averagestress','average_stress','stresslevel','stress_level']
const STRESS_MANAGEMENT_KEYS=['stressmanagementscore','stress_management_score','fitbitstressmanagementscore','fitbit_stress_management_score']
const RESTING_BPM_KEYS=['restingbpm','resting_bpm','restingheartrate','resting_heart_rate','rhr','bpmresting','bpm_resting','frequenciacardiacarepouso','frequencia_cardiaca_repouso']
const AVERAGE_BPM_KEYS=['averagebpm','average_bpm','avgbpm','avg_bpm','averageheartrate','average_heart_rate','avgheartrate','avg_heart_rate','heartrateavg','heart_rate_avg','bpm','frequenciacardiacamedia','frequencia_cardiaca_media']
const STRESS_ORIENTATION_KEYS=['stressorientation','stress_orientation','stressdirection','stress_direction']

function normalizeKey(value:string){return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_]/g,'')}
function mapRow(row:Record<string,unknown>){const map=new Map<string,unknown>();for(const[key,value]of Object.entries(row))map.set(normalizeKey(key),value);return map}
function first(map:Map<string,unknown>,keys:string[]){for(const key of keys)if(map.has(key))return map.get(key);return undefined}
function toNumber(value:unknown){if(typeof value==='number'&&Number.isFinite(value))return value;if(typeof value!=='string')return null;const cleaned=value.trim().replace(/\s/g,'').replace(',','.');if(!cleaned)return null;const parsed=Number(cleaned);return Number.isFinite(parsed)?parsed:null}
function bounded(value:unknown,min:number,max:number){const number=toNumber(value);return number!==null&&number>=min&&number<=max?number:null}
function normalizeSource(value:unknown,fallback:string){const source=nonEmptyString(value)||fallback.trim()||'smartwatch';return source.slice(0,80)}

export function normalizeWearableDate(value:unknown):string|null{
  if(typeof value!=='string'&&typeof value!=='number')return null
  const raw=String(value).trim()
  if(!raw)return null
  const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if(iso){const out=`${iso[1]}-${iso[2]}-${iso[3]}`;return Number.isFinite(new Date(`${out}T00:00:00Z`).getTime())?out:null}
  const br=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if(br){const out=`${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;return Number.isFinite(new Date(`${out}T00:00:00Z`).getTime())?out:null}
  const time=new Date(raw).getTime();if(!Number.isFinite(time))return null
  return new Date(time).toISOString().slice(0,10)
}

function parseStressOrientation(value:unknown,keyUsed:string|null):StressOrientation{
  const text=typeof value==='string'?value.trim().toLocaleLowerCase('pt-BR'):''
  if(/better|melhor|higher.?is.?better|alto.?melhor/.test(text))return'higher-is-better'
  if(/more.?stress|mais.?estresse|higher.?is.?more/.test(text))return'higher-is-more-stress'
  return keyUsed&&STRESS_MANAGEMENT_KEYS.includes(keyUsed)?'higher-is-better':'higher-is-more-stress'
}

function findKey(map:Map<string,unknown>,keys:string[]){for(const key of keys)if(map.has(key))return key;return null}

export function normalizeWearableRow(row:Record<string,unknown>,fallbackSource='smartwatch'):WearableDailyPayload|null{
  const map=mapRow(row)
  const date=normalizeWearableDate(first(map,DATE_KEYS));if(!date)return null
  const minuteKey=findKey(map,SLEEP_MINUTE_KEYS),hourKey=findKey(map,SLEEP_HOUR_KEYS)
  let sleepMinutes=minuteKey?bounded(map.get(minuteKey),1,1200):null
  if(sleepMinutes===null&&hourKey){const hours=bounded(map.get(hourKey),0.1,20);if(hours!==null)sleepMinutes=Math.round(hours*60)}
  const stressKey=findKey(map,[...STRESS_KEYS,...STRESS_MANAGEMENT_KEYS])
  const stressScore=stressKey?bounded(map.get(stressKey),0,100):null
  const restingBpm=bounded(first(map,RESTING_BPM_KEYS),20,250)
  const averageBpm=bounded(first(map,AVERAGE_BPM_KEYS),20,250)
  if(sleepMinutes===null&&stressScore===null&&restingBpm===null&&averageBpm===null)return null
  const payload:WearableDailyPayload={version:'1.0',subtype:'wearable_daily',date,source:normalizeSource(first(map,SOURCE_KEYS),fallbackSource),importedAt:new Date().toISOString()}
  if(sleepMinutes!==null)payload.sleepMinutes=Math.round(sleepMinutes)
  if(stressScore!==null){payload.stressScore=stressScore;payload.stressOrientation=parseStressOrientation(first(map,STRESS_ORIENTATION_KEYS),stressKey)}
  if(restingBpm!==null)payload.restingBpm=restingBpm
  if(averageBpm!==null)payload.averageBpm=averageBpm
  return payload
}

function parseCsvRows(text:string){
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false
  for(let i=0;i<text.length;i++){
    const char=text[i]
    if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;continue}
    if(char===','&&!quoted){row.push(cell);cell='';continue}
    if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(value=>value.trim()))rows.push(row);row=[];continue}
    cell+=char
  }
  row.push(cell);if(row.some(value=>value.trim()))rows.push(row)
  if(rows.length<2)return[]
  const headers=rows[0].map(value=>value.trim())
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??''])))
}

export function parseWearableText(text:string,fallbackSource='smartwatch'):WearableDailyPayload[]{
  let rows:Record<string,unknown>[]=[]
  const trimmed=text.trim();if(!trimmed)return[]
  if(trimmed.startsWith('{')||trimmed.startsWith('[')){
    const parsed=JSON.parse(trimmed) as unknown
    if(Array.isArray(parsed))rows=parsed.filter(isObject)
    else if(isObject(parsed)){
      const candidate=[parsed.records,parsed.data,parsed.items].find(Array.isArray)
      rows=Array.isArray(candidate)?candidate.filter(isObject):[parsed]
    }
  }else rows=parseCsvRows(trimmed)
  const normalized=rows.slice(0,MAX_WEARABLE_IMPORT_ROWS).map(row=>normalizeWearableRow(row,fallbackSource)).filter((row):row is WearableDailyPayload=>row!==null)
  const byDate=new Map<string,WearableDailyPayload>();for(const row of normalized)byDate.set(`${row.source.toLocaleLowerCase('pt-BR')}|${row.date}`,row)
  return[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date))
}

function isWearablePayload(value:unknown):value is WearableDailyPayload{return isObject(value)&&nonEmptyString(value.subtype)==='wearable_daily'&&Boolean(normalizeWearableDate(value.date))}

type WearableRecord={createdAt:string;payload:WearableDailyPayload}
export function extractWearableRecords(records:RawRecord[]):WearableRecord[]{
  const byKey=new Map<string,WearableRecord>()
  for(const record of records){if(record.record_type!=='review'||!isWearablePayload(record.payload))continue;const key=`${record.payload.source.toLocaleLowerCase('pt-BR')}|${record.payload.date}`;const existing=byKey.get(key);if(!existing||new Date(record.created_at).getTime()>=new Date(existing.createdAt).getTime())byKey.set(key,{createdAt:record.created_at,payload:record.payload})}
  return[...byKey.values()].sort((a,b)=>a.payload.date.localeCompare(b.payload.date))
}

function sampleSd(values:number[]){if(values.length<2)return 0;const mean=safeMean(values);if(mean===null)return 0;return Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/(values.length-1))}
function emptyMetric(unit:string):WearableMetricSummary{return{latest:null,baseline:null,baselineN:0,difference:null,threshold:null,signal:'insufficient',unit}}
function metricSummary(latest:number|null,prior:number[],unit:string,absoluteFloor:number,direction:'low'|'high'):WearableMetricSummary{
  if(latest===null)return emptyMetric(unit)
  if(prior.length<MIN_WEARABLE_BASELINE_N)return{latest,baseline:null,baselineN:prior.length,difference:null,threshold:null,signal:'insufficient',unit}
  const baseline=safeMean(prior);if(baseline===null)return emptyMetric(unit)
  const threshold=Math.max(absoluteFloor,0.75*sampleSd(prior));const difference=latest-baseline
  const signal=direction==='low'?(difference<=-threshold?'lower':difference>=threshold?'higher':'within'):(difference>=threshold?'higher':difference<=-threshold?'lower':'within')
  return{latest,baseline,baselineN:prior.length,difference,threshold,signal,unit}
}

function dateMs(date:string){return new Date(`${date}T00:00:00Z`).getTime()}

export function summarizeWearable(records:RawRecord[],anchorDate?:string|null):WearableSummary{
  const wearable=extractWearableRecords(records)
  const empty:WearableSummary={latestDate:null,source:null,fresh:false,daysFromAnchor:null,sleep:emptyMetric('min'),stress:emptyMetric('pontos'),stressOrientation:null,restingBpm:emptyMetric('bpm'),averageBpm:null,lowerSleep:false,higherStressBurden:false,higherRestingBpm:false,shouldReduceLoad:false}
  if(!wearable.length)return empty
  const normalizedAnchor=normalizeWearableDate(anchorDate??'')
  const eligible=normalizedAnchor?wearable.filter(record=>record.payload.date<=normalizedAnchor):wearable
  const latest=(eligible.length?eligible:wearable).at(-1);if(!latest)return empty
  const sourceKey=latest.payload.source.toLocaleLowerCase('pt-BR'),latestTime=dateMs(latest.payload.date)
  const prior=wearable.filter(record=>record.payload.source.toLocaleLowerCase('pt-BR')===sourceKey&&record.payload.date<latest.payload.date&&dateMs(record.payload.date)>=latestTime-WEARABLE_BASELINE_DAYS*DAY_MS)
  const sleep=metricSummary(finiteNumber(latest.payload.sleepMinutes),prior.map(record=>finiteNumber(record.payload.sleepMinutes)).filter((value):value is number=>value!==null),'min',30,'low')
  const stressOrientation=latest.payload.stressScore!==undefined?(latest.payload.stressOrientation??'higher-is-more-stress'):null
  const stressDirection=stressOrientation==='higher-is-better'?'low':'high'
  const stress=metricSummary(finiteNumber(latest.payload.stressScore),prior.filter(record=>(record.payload.stressOrientation??'higher-is-more-stress')===stressOrientation).map(record=>finiteNumber(record.payload.stressScore)).filter((value):value is number=>value!==null),'pontos',8,stressDirection)
  const restingBpm=metricSummary(finiteNumber(latest.payload.restingBpm),prior.map(record=>finiteNumber(record.payload.restingBpm)).filter((value):value is number=>value!==null),'bpm',5,'high')
  const lowerSleep=sleep.signal==='lower'
  const higherStressBurden=stressOrientation==='higher-is-better'?stress.signal==='lower':stress.signal==='higher'
  const higherRestingBpm=restingBpm.signal==='higher'
  const daysFromAnchor=normalizedAnchor?Math.round((dateMs(normalizedAnchor)-latestTime)/DAY_MS):0
  const fresh=daysFromAnchor>=0&&daysFromAnchor<=2
  return{latestDate:latest.payload.date,source:latest.payload.source,fresh,daysFromAnchor,sleep,stress,stressOrientation,restingBpm,averageBpm:finiteNumber(latest.payload.averageBpm),lowerSleep,higherStressBurden,higherRestingBpm,shouldReduceLoad:fresh&&(lowerSleep||higherStressBurden)}
}
