import {useCallback,useEffect,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import type {Session} from '@supabase/supabase-js'
import {supabase} from './supabase'

type Phase='checking'|'login'|'enroll'|'enroll-verify'|'challenge'|'ready'|'error'
type TotpSetup={factorId:string;qr:string;secret:string}

const IDLE_TIMEOUT_MS=30*60*1000
const codeOk=(value:string)=>/^\d{6}$/.test(value)

export default function SecureRoot({children}:{children:ReactNode}){
  const[phase,setPhase]=useState<Phase>('checking')
  const[email,setEmail]=useState('')
  const[password,setPassword]=useState('')
  const[code,setCode]=useState('')
  const[factorId,setFactorId]=useState('')
  const[setup,setSetup]=useState<TotpSetup|null>(null)
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const assessmentSeq=useRef(0)

  const assess=useCallback(async(session:Session|null)=>{
    const seq=++assessmentSeq.current
    setMessage('')
    if(!session){setPhase('login');return}
    setPhase('checking')
    const userResult=await supabase.auth.getUser()
    if(seq!==assessmentSeq.current)return
    if(userResult.error||!userResult.data.user){
      await supabase.auth.signOut({scope:'local'})
      if(seq===assessmentSeq.current)setPhase('login')
      return
    }
    const aal=await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if(seq!==assessmentSeq.current)return
    if(aal.error){setMessage('Não foi possível verificar o nível de autenticação.');setPhase('error');return}
    if(aal.data.currentLevel==='aal2'){
      setSetup(null);setCode('');setFactorId('');setPhase('ready');return
    }
    const factors=await supabase.auth.mfa.listFactors()
    if(seq!==assessmentSeq.current)return
    if(factors.error){setMessage('Não foi possível verificar seus fatores de segurança.');setPhase('error');return}
    const verified=factors.data.totp.find(f=>f.status==='verified')
    if(verified){setFactorId(verified.id);setPhase('challenge');return}
    setPhase('enroll')
  },[])

  useEffect(()=>{
    let active=true
    supabase.auth.getSession().then(({data})=>{if(active)void assess(data.session)})
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(!active)return
      window.setTimeout(()=>{if(active)void assess(session)},0)
    })
    return()=>{active=false;subscription.unsubscribe();assessmentSeq.current++}
  },[assess])

  useEffect(()=>{
    if(phase!=='ready')return
    let timer=0
    const lock=()=>{void supabase.auth.signOut({scope:'local'})}
    const reset=()=>{
      window.clearTimeout(timer)
      timer=window.setTimeout(lock,IDLE_TIMEOUT_MS)
    }
    const events=['pointerdown','keydown','touchstart'] as const
    events.forEach(event=>window.addEventListener(event,reset,{passive:true}))
    document.addEventListener('visibilitychange',reset)
    reset()
    return()=>{
      window.clearTimeout(timer)
      events.forEach(event=>window.removeEventListener(event,reset))
      document.removeEventListener('visibilitychange',reset)
    }
  },[phase])

  const login=async()=>{
    if(!email.trim()||!password)return
    setBusy(true);setMessage('')
    try{
      const{data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password})
      if(error||!data.session)throw error||new Error('login')
      setPassword('')
      await assess(data.session)
    }catch{
      setMessage('Não foi possível entrar. Confira suas credenciais e tente novamente.')
      setPhase('login')
    }finally{setBusy(false)}
  }

  const beginEnrollment=async()=>{
    setBusy(true);setMessage('')
    try{
      const existing=await supabase.auth.mfa.listFactors()
      if(existing.error)throw existing.error
      for(const factor of existing.data.totp.filter(f=>f.status!=='verified')){
        await supabase.auth.mfa.unenroll({factorId:factor.id})
      }
      const{data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Nexo'})
      if(error)throw error
      setSetup({factorId:data.id,qr:data.totp.qr_code,secret:data.totp.secret})
      setFactorId(data.id);setCode('');setPhase('enroll-verify')
    }catch{
      setMessage('Não foi possível iniciar a configuração do autenticador. Tente novamente.')
    }finally{setBusy(false)}
  }

  const verify=async()=>{
    if(!factorId||!codeOk(code))return
    setBusy(true);setMessage('')
    try{
      const{error}=await supabase.auth.mfa.challengeAndVerify({factorId,code})
      if(error)throw error
      setCode('');setSetup(null);setPhase('checking')
      const{data}=await supabase.auth.getSession()
      await assess(data.session)
    }catch{
      setMessage('Código inválido ou expirado. Aguarde o próximo código do autenticador e tente novamente.')
    }finally{setBusy(false)}
  }

  const signOut=()=>{void supabase.auth.signOut({scope:'local'})}

  if(phase==='ready')return <>{children}</>
  if(phase==='checking')return <SecurityShell><div className="security-spinner" aria-hidden="true"/><h1>Verificando acesso</h1><p>Validando sua sessão e o segundo fator antes de carregar seus dados.</p></SecurityShell>

  if(phase==='login')return <SecurityShell>
    <div className="security-badge">ACESSO RESTRITO</div><h1>Nexo</h1>
    <p>Entre com sua conta existente. A aplicação só libera os dados depois da autenticação em duas etapas.</p>
    <div className="security-form">
      <label>E-mail<input type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void login()}}/></label>
      <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void login()}}/></label>
      {message&&<p className="security-error" role="alert">{message}</p>}
      <button className="primary" disabled={busy||!email.trim()||!password} onClick={()=>void login()}>{busy?'Verificando...':'Entrar'}</button>
      <small>Criação de novas contas foi removida da interface pública do Nexo.</small>
    </div>
  </SecurityShell>

  if(phase==='enroll')return <SecurityShell>
    <div className="security-badge">SEGUNDO FATOR OBRIGATÓRIO</div><h1>Proteja sua conta</h1>
    <p>Antes de acessar seus registros, configure um aplicativo autenticador. O código muda periodicamente e será exigido depois da senha.</p>
    <div className="security-callout"><b>Você vai precisar de um autenticador TOTP.</b><span>Use um aplicativo autenticador compatível com códigos temporários de 6 dígitos.</span></div>
    {message&&<p className="security-error" role="alert">{message}</p>}
    <div className="security-actions"><button className="primary" disabled={busy} onClick={()=>void beginEnrollment()}>{busy?'Preparando...':'Configurar autenticador'}</button><button className="secondary" onClick={signOut}>Sair</button></div>
  </SecurityShell>

  if(phase==='enroll-verify'&&setup)return <SecurityShell>
    <div className="security-badge">CONFIGURAÇÃO MFA</div><h1>Escaneie e confirme</h1>
    <p>Escaneie o QR code no seu aplicativo autenticador. Depois digite abaixo o código de 6 dígitos gerado pelo aplicativo.</p>
    <div className="security-qr"><img src={setup.qr} alt="QR code para configurar o autenticador do Nexo"/><div><small>Se não conseguir escanear, use esta chave manual:</small><code>{setup.secret}</code><small>Guarde essa chave em local seguro somente enquanto conclui a configuração.</small></div></div>
    <CodeForm code={code} setCode={setCode} busy={busy} message={message} submit={verify} label="Ativar e entrar"/>
    <button className="secondary" onClick={signOut}>Cancelar e sair</button>
  </SecurityShell>

  if(phase==='challenge')return <SecurityShell>
    <div className="security-badge">VERIFICAÇÃO EM DUAS ETAPAS</div><h1>Confirme que é você</h1>
    <p>Abra seu aplicativo autenticador e digite o código atual de 6 dígitos. Seus registros permanecem bloqueados até esta etapa ser concluída.</p>
    <CodeForm code={code} setCode={setCode} busy={busy} message={message} submit={verify} label="Verificar e entrar"/>
    <button className="secondary" onClick={signOut}>Sair</button>
  </SecurityShell>

  return <SecurityShell><div className="security-badge">ACESSO NÃO LIBERADO</div><h1>Verificação interrompida</h1><p>{message||'Não foi possível concluir a validação de segurança.'}</p><div className="security-actions"><button className="primary" onClick={()=>{setPhase('checking');supabase.auth.getSession().then(({data})=>void assess(data.session))}}>Tentar novamente</button><button className="secondary" onClick={signOut}>Sair</button></div></SecurityShell>
}

function SecurityShell({children}:{children:ReactNode}){
  return <main className="security-shell"><section className="security-card">{children}<footer>Seus dados só são carregados após autenticação e verificação do segundo fator.</footer></section></main>
}

function CodeForm({code,setCode,busy,message,submit,label}:{code:string;setCode:(value:string)=>void;busy:boolean;message:string;submit:()=>Promise<void>;label:string}){
  return <div className="security-form security-code-form">
    <label>Código de 6 dígitos<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e=>{if(e.key==='Enter'&&codeOk(code))void submit()}}/></label>
    {message&&<p className="security-error" role="alert">{message}</p>}
    <button className="primary" disabled={busy||!codeOk(code)} onClick={()=>void submit()}>{busy?'Verificando...':label}</button>
  </div>
}
