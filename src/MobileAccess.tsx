import {useEffect,useMemo,useState} from 'react'
import {supabase} from './supabase'

type PasskeyItem={id:string;friendly_name?:string;created_at:string;last_used_at?:string}
type NavigatorWithStandalone=Navigator&{standalone?:boolean}

const NEXO_URL='https://nataliloure.github.io/nexo/'

function errorCode(error:unknown){return typeof error==='object'&&error!==null&&'code'in error?String((error as {code?:unknown}).code||''):''}

export default function MobileAccess(){
  const[open,setOpen]=useState(false)
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[passkeys,setPasskeys]=useState<PasskeyItem[]>([])
  const supportsPasskey=typeof window!=='undefined'&&'PublicKeyCredential'in window
  const standalone=useMemo(()=>typeof window!=='undefined'&&(window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as NavigatorWithStandalone).standalone)),[])
  const isIOS=useMemo(()=>typeof navigator!=='undefined'&&/iPhone|iPad|iPod/i.test(navigator.userAgent),[])

  useEffect(()=>{
    if(!open||!supportsPasskey)return
    let active=true
    void supabase.auth.passkey.list().then(({data,error})=>{
      if(!active)return
      if(error){
        if(errorCode(error)!=='passkey_disabled')setMessage('Não foi possível consultar as chaves de acesso deste dispositivo.')
        return
      }
      setPasskeys((data||[]) as PasskeyItem[])
    })
    return()=>{active=false}
  },[open,supportsPasskey])

  const registerPasskey=async()=>{
    if(!supportsPasskey)return
    setBusy(true);setMessage('')
    try{
      const{data,error}=await supabase.auth.registerPasskey()
      if(error)throw error
      const listed=await supabase.auth.passkey.list()
      if(!listed.error)setPasskeys((listed.data||[]) as PasskeyItem[])
      setMessage(`Chave de acesso criada${data?.friendly_name?` em ${data.friendly_name}`:''}. Nos próximos logins você poderá usar Face ID ou a chave de acesso do aparelho.`)
    }catch(error){
      if(errorCode(error)==='passkey_disabled')setMessage('O Nexo já está preparado para Face ID, mas o recurso Passkeys ainda precisa ser ativado nas configurações de autenticação do projeto Supabase.')
      else setMessage('Não foi possível criar a chave de acesso. Se você cancelou o Face ID, tente novamente quando quiser.')
    }finally{setBusy(false)}
  }

  return <>
    <button className="mobile-access-launch" type="button" onClick={()=>setOpen(true)} aria-label="Abrir acesso para iPhone">iPhone</button>
    {open&&<div className="mobile-access-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setOpen(false)}}>
      <section className="mobile-access-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-access-title">
        <button className="mobile-access-close" type="button" onClick={()=>setOpen(false)} aria-label="Fechar">×</button>
        <div className="eyebrow">acesso móvel seguro</div>
        <h2 id="mobile-access-title">Nexo no iPhone</h2>
        <p>Use o Nexo como um aplicativo na Tela de Início. O QR abaixo contém somente o endereço público do site. <b>Ele nunca contém senha, token ou sessão.</b></p>

        <div className="mobile-access-grid">
          <div className="mobile-access-qr-card">
            <img src="./nexo-mobile-qr.svg" alt="QR code que abre o endereço público do Nexo"/>
            <small>Escaneie com a câmera do iPhone</small>
            <a href={NEXO_URL} target="_blank" rel="noreferrer">Abrir endereço do Nexo</a>
          </div>
          <div className="mobile-access-steps">
            <h3>Como deixar na Tela de Início</h3>
            <ol>
              <li>Escaneie o QR e abra o Nexo no Safari.</li>
              <li>Entre normalmente e conclua o segundo fator.</li>
              <li>No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</li>
              <li>Abra o ícone Nexo como qualquer outro aplicativo.</li>
            </ol>
            {standalone&&<p className="mobile-access-ok">✓ O Nexo já está aberto em modo de aplicativo neste dispositivo.</p>}
          </div>
        </div>

        <div className="mobile-access-passkey">
          <div><div className="eyebrow">entrada rápida e resistente a phishing</div><h3>{isIOS?'Usar Face ID':'Usar chave de acesso'}</h3></div>
          <p>Depois de registrar uma passkey, o primeiro fator de login pode ser feito pelo Face ID, Touch ID, PIN ou gerenciador de chaves do aparelho. O segundo fator do Nexo continua sendo exigido quando necessário.</p>
          {supportsPasskey?<button className="primary" type="button" disabled={busy} onClick={()=>void registerPasskey()}>{busy?'Configurando...':isIOS?'Ativar Face ID neste iPhone':'Registrar chave de acesso neste dispositivo'}</button>:<p className="method-note">Este navegador não oferece WebAuthn/passkeys.</p>}
          {passkeys.length>0&&<div className="mobile-passkey-list"><b>Chaves registradas</b>{passkeys.map(item=><span key={item.id}>{item.friendly_name||'Chave de acesso'}{item.last_used_at?' · usada recentemente':''}</span>)}</div>}
          {message&&<p className="mobile-access-message" role="status">{message}</p>}
        </div>

        <p className="method-note">Por segurança, o Nexo mantém a política de bloqueio por inatividade. O QR serve apenas para abrir o aplicativo no aparelho e não transfere uma sessão autenticada.</p>
      </section>
    </div>}
  </>
}
