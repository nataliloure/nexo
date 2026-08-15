import type {DomainComparison} from './todayTypes'

type Props={comparison:DomainComparison}

export default function WhyThisInsight({comparison}:Props){
  const{current,baseline,baselineN,difference}=comparison
  if(current===null||baseline===null||difference===null)return null
  return <details className="today-why">
    <summary>Por que estou vendo isso?</summary>
    <p>Este resultado compara o check-in mais recente com {baselineN} check-in{baselineN===1?'':'s'} válido{baselineN===1?'':'s'} registrado{baselineN===1?'':'s'} nos 30 dias anteriores.</p>
    <dl>
      <div><dt>Atual</dt><dd>{current.toFixed(2)}/5</dd></div>
      <div><dt>Média pessoal anterior</dt><dd>{baseline.toFixed(2)}/5</dd></div>
      <div><dt>Diferença</dt><dd>{difference>0?'+':''}{difference.toFixed(2)}</dd></div>
    </dl>
    <p className="method-note">Diferenças com módulo inferior a 0,30 são exibidas como próximas ao padrão recente. Essa regra organiza a interface e não é um limiar clínico. A comparação é descritiva e não permite inferência causal.</p>
  </details>
}
