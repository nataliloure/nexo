import{useState}from'react'
import{supabase}from'../supabase'
import{parseWearableText}from'./wearableMetrics'
import type{WearableDailyPayload}from'./wearableTypes'

export default function WearableImport({onImported}:{onImported:()=>Promise<void>|void}){
  const[source,setSource]=useState('smartwatch')
  const[preview,setPreview]=useState<WearableDailyPayload[]>([])
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')

  const choose=async(file:File|null)=>{
    setMessage('');setPreview([]);if(!file)return
    try{
      if(file.size>5_000_000)throw new Error('O arquivo excede 5 MB.')
      const rows=parseWearableText(await file.text(),source)
      if(!rows.length)throw new Error('Nenhuma linha reconhecida. Inclua data e ao menos sono, estresse ou BPM.')
      setPreview(rows)
      setMessage(`${rows.length} dia(s) reconhecido(s). A fonte foi aplicada no momento da leitura do arquivo.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Não foi possível ler o arquivo.')}
  }

  const save=async()=>{
    if(!preview.length)return
    setBusy(true);setMessage('')
    try{
      const{data:{user},error:userError}=await supabase.auth.getUser();if(userError||!user)throw userError||new Error('Sessão inválida.')
      const{data:existing,error:existingError}=await supabase.from('nexo_records').select('payload').eq('record_type','experiment')
      if(existingError)throw existingError
      const known=new Set((existing||[]).map((row:any)=>row.payload).filter((payload:any)=>payload?.subtype==='wearable_daily').map((payload:any)=>`${String(payload.source||'').toLocaleLowerCase('pt-BR')}|${payload.date}`))
      const rows=preview.filter(payload=>!known.has(`${payload.source.toLocaleLowerCase('pt-BR')}|${payload.date}`))
      for(let start=0;start<rows.length;start+=200){
        const batch=rows.slice(start,start+200).map(payload=>({user_id:user.id,record_type:'experiment',payload}))
        const{error}=await supabase.from('nexo_records').insert(batch);if(error)throw error
      }
      setMessage(rows.length?`${rows.length} dia(s) importado(s). ${preview.length-rows.length} duplicado(s) foram ignorados.`:'Os dias desse arquivo já estavam importados.')
      setPreview([]);await onImported()
    }catch(error){setMessage(error instanceof Error?error.message:'Não foi possível importar os dados.')}
    finally{setBusy(false)}
  }

  return <div className="wearable-import">
    <div className="wearable-import-grid">
      <label>Fonte do relógio ou app<input value={source} disabled={preview.length>0} maxLength={80} placeholder="Ex.: Garmin, Samsung Health" onChange={event=>setSource(event.target.value||'smartwatch')}/></label>
      <label>Arquivo CSV ou JSON<input type="file" accept=".csv,.json,text/csv,application/json" onChange={event=>void choose(event.currentTarget.files?.[0]??null)}/></label>
    </div>
    <p className="method-note">O importador guarda apenas data, duração do sono, escore de estresse e BPM de repouso/médio. Outras colunas do arquivo são descartadas antes do envio ao Supabase. O subtipo técnico <code>wearable_daily</code> não conta como atividade voluntária do Nexo.</p>
    <details className="wearable-columns"><summary>Colunas reconhecidas</summary><p>Data: <code>date</code>, <code>data</code>, <code>day</code>. Sono: minutos ou horas de sono. Estresse: <code>stress</code>, <code>stress_score</code> ou <code>stress_management_score</code>. BPM: <code>resting_heart_rate</code>, <code>rhr</code>, <code>average_heart_rate</code> ou <code>bpm</code>.</p><p>Para escores em que valores maiores significam melhor manejo do estresse, como <code>stress_management_score</code>, a direção é invertida automaticamente. CSV separado por vírgula ou ponto e vírgula é aceito.</p></details>
    {preview.length>0&&<div className="wearable-preview"><b>{preview.length} dia(s) prontos para importar</b><span>{preview[0].date} a {preview.at(-1)?.date}</span><button className="primary" disabled={busy} onClick={()=>void save()}>{busy?'Importando...':'Importar dados do smartwatch'}</button></div>}
    {message&&<p className="wearable-message" role="status">{message}</p>}
  </div>
}
