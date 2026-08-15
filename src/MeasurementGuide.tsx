import {useLocation} from 'react-router-dom'

type Guide={
  title:string
  measure:string
  requirement:string
  result:string
  limit:string
}

const guides:Record<string,Guide>={
  '/':{
    title:'Como ler a aba Hoje',
    measure:'Resume o check-in mais recente e a quantidade de observações privadas. Para cada domínio, usa a média dos 3 itens correspondentes, em escala de 1 a 5.',
    requirement:'Ao menos 1 check-in completo. Sem check-in, a aba mostra apenas o estado de preenchimento e o número de registros.',
    result:'Cinco médias do check-in mais recente: Autorregulação, Flexibilidade, Socioemocional, Relações e Metacognição. Cada média é a soma dos 3 itens do domínio dividida por 3.',
    limit:'São indicadores autorais de auto-observação e comparação pessoal. Não são escores clínicos, diagnósticos ou normas populacionais.',
  },
  '/checkin':{
    title:'O que o Check-in acompanha',
    measure:'Autoavaliação diária de 15 comportamentos e processos, com 3 itens para cada domínio: Autorregulação, Flexibilidade, Socioemocional, Relações e Metacognição. Também registra Energia, Estresse, Conexão social e Sono em escalas de 0 a 10, além de evento e reflexão livre.',
    requirement:'Os 15 itens de 1 a 5 precisam ser respondidos para o check-in ser salvo. Evento importante e reflexão livre são opcionais.',
    result:'Gera uma média de 1 a 5 para cada um dos cinco domínios. Essas médias alimentam Hoje, Evolução e Sugestões. Os indicadores contextuais ficam associados ao mesmo registro para interpretação longitudinal.',
    limit:'Os 15 itens são autorais e não constituem uma escala psicométrica validada. Um valor baixo ou alto em um dia não representa diagnóstico, traço estável ou avaliação clínica.',
  },
  '/evolucao':{
    title:'O que a Evolução mede',
    measure:'Acompanha mudança intraindividual nas cinco médias do Check-in ao longo do tempo, sempre comparando seus registros com o seu próprio histórico.',
    requirement:'A visualização começa com 1 check-in, mas tendências tornam-se mais informativas conforme se acumulam observações repetidas em diferentes dias e contextos.',
    result:'Para cada domínio, mostra a média dos últimos 7 check-ins e barras referentes aos últimos 30 check-ins disponíveis. Registros ausentes permanecem ausentes e não viram zero.',
    limit:'A série mostra padrão descritivo, não causalidade. “Últimos 7” e “últimos 30” significam registros, não necessariamente dias consecutivos.',
  },
  '/sugestoes':{
    title:'Quando as Sugestões são acionadas',
    measure:'Mede a diferença entre a média de cada domínio no check-in mais recente e a média pessoal daquele mesmo domínio nos 30 dias anteriores.',
    requirement:'É necessário 1 check-in atual e pelo menos 3 check-ins anteriores dentro dos 30 dias precedentes. Com histórico menor, nenhuma sugestão automática é acionada.',
    result:'Calcula, para cada domínio, valor atual, média pessoal de 30 dias, número de observações e diferença atual menos média. Uma sugestão aparece apenas quando essa diferença é negativa.',
    limit:'Estar abaixo da própria média não significa piora clínica. As práticas são educativas e inspiradas em evidência sobre psicoterapias completas; não têm o mesmo status causal das intervenções estudadas.',
  },
  '/nuvem':{
    title:'O que a Nuvem de palavras descreve',
    measure:'Conta a frequência de palavras nas respostas abertas de Check-ins, Relações, Experimentos, Valores, Reflexões e Revisões, depois de remover palavras muito comuns e as exclusões escolhidas pelo usuário.',
    requirement:'É preciso existir ao menos 1 resposta textual no período e origem selecionados. Uma palavra só aparece se atingir a frequência mínima definida no filtro.',
    result:'Mostra número de registros incluídos, quantidade de respostas abertas, total de palavras analisadas, nuvem proporcional à frequência e ranking dos termos mais recorrentes.',
    limit:'Frequência não mede importância psicológica, sentimento, valência emocional, tema latente ou causalidade. Palavras iguais são agrupadas pela forma textual, independentemente do contexto.',
  },
  '/relacoes':{
    title:'O que a aba Relações acompanha',
    measure:'Registra autoavaliações de 0 a 10 sobre qualidade da interação, presença, escuta, assertividade, empatia, limites e conexão após a interação. Também separa observação, inferência, pressuposto e interpretações alternativas.',
    requirement:'O sistema permite salvar com os valores disponíveis. Para um registro interpretável, é recomendável descrever o contexto e preencher conscientemente as escalas e os campos qualitativos.',
    result:'Cria um registro interpessoal longitudinal que pode ser retomado qualitativamente e entrar na Nuvem de palavras. A versão atual não calcula um escore composto de “qualidade relacional”.',
    limit:'As avaliações são autorrelatos contextuais, não medidas diagnósticas de relacionamento, personalidade ou habilidade social.',
  },
  '/experimentos':{
    title:'O que a aba Experimentos acompanha',
    measure:'Compara previsão e experiência: situação, previsão, emoção antecipada, intensidade prevista, certeza, o que realmente aconteceu, emoção observada, intensidade observada e aprendizado.',
    requirement:'O sistema permite salvar o registro, mas uma comparação útil exige preencher tanto a etapa “Antes” quanto a etapa “Depois”.',
    result:'Preserva os pares previsão versus experiência para identificar, ao longo do tempo, onde expectativas coincidem ou divergem da experiência observada. A versão atual não calcula automaticamente erro de previsão ou calibração.',
    limit:'Divergência entre previsão e experiência é informação para aprendizagem, não prova de viés cognitivo, irracionalidade ou transtorno.',
  },
  '/valores':{
    title:'O que a aba Valores acompanha',
    measure:'Registra a área de vida escolhida, o valor declarado, a forma como a pessoa deseja se comportar e uma ação comprometida coerente com esse valor.',
    requirement:'Para que o registro tenha sentido, preencha valor, comportamento desejado e ação comprometida. O sistema atualmente permite salvamento mesmo quando algum campo textual está vazio.',
    result:'Produz um histórico qualitativo de direções valorizadas e ações planejadas. A versão atual não gera nota de “aderência a valores” nem avalia se a ação foi concluída.',
    limit:'Valor não é objetivo, desempenho nem indicador moral. O Nexo não classifica valores como melhores, piores, adequados ou inadequados.',
  },
  '/reflexao':{
    title:'O que a aba Reflexão acompanha',
    measure:'Registra um pensamento e uma possível ação coerente com valores sem exigir a eliminação do pensamento. As perguntas de auditoria apoiam metacognição sobre propósito, evidência, pressupostos, alternativas e implicações.',
    requirement:'Para gerar um registro longitudinal, é necessário salvar o pensamento e a ação informados. As perguntas de auditoria exibidas ao lado são guias de reflexão e, na versão atual, suas respostas não são armazenadas separadamente.',
    result:'Cria um registro qualitativo que pode ser revisitado e analisado na Nuvem de palavras. Não é calculado um escore de flexibilidade, desfusão ou qualidade do raciocínio nessa aba.',
    limit:'O exercício não determina se um pensamento é verdadeiro ou falso e não substitui avaliação clínica ou psicoterapia.',
  },
  '/revisao':{
    title:'O que a Revisão semanal acompanha',
    measure:'Organiza reflexão qualitativa sobre facilidades, dificuldades, ações alinhadas a valores, controle, conexão, conversas evitadas, pressupostos, previsão versus experiência, aprendizado e próxima habilidade a praticar.',
    requirement:'A revisão pode ser salva parcialmente, mas seu valor interpretativo aumenta quando as perguntas relevantes da semana são respondidas com exemplos concretos.',
    result:'Gera um registro narrativo semanal e fornece material para comparação qualitativa ao longo do tempo e para a Nuvem de palavras. Não há pontuação semanal automática.',
    limit:'A revisão é um instrumento de autorreflexão, não uma avaliação de desempenho, saúde mental ou progresso terapêutico validado.',
  },
  '/dados':{
    title:'O que a aba Dados faz',
    measure:'Esta aba não mede um construto. Ela administra os registros privados associados à conta autenticada.',
    requirement:'É necessário estar autenticado. A exportação usa os registros disponíveis; a importação exige um backup JSON válido dentro dos limites de segurança definidos pelo sistema.',
    result:'Permite exportar, importar e excluir os próprios registros e informa quantas observações estão associadas à conta.',
    limit:'Exportações contêm informações pessoais. O arquivo baixado passa a depender da segurança do dispositivo e do local onde for armazenado.',
  },
  '/ciencia':{
    title:'O que a aba Ciência informa',
    measure:'Esta aba não produz medida nem escore. Ela documenta a fundamentação conceitual, as referências utilizadas e as escolhas de privacidade e método do Nexo.',
    requirement:'Nenhum preenchimento é necessário.',
    result:'Oferece transparência para distinguir itens autorais, referenciais científicos e limites de uso da plataforma.',
    limit:'Citar um referencial científico não transforma automaticamente os itens do Nexo em instrumento validado nem autoriza interpretação clínica.',
  },
}

export default function MeasurementGuide(){
  const{pathname}=useLocation()
  const guide=guides[pathname]||guides['/']
  return <section className="measure-guide" aria-label="Como interpretar esta aba">
    <div className="measure-guide-head"><span className="measure-guide-icon">◎</span><div><div className="eyebrow">medida, requisito e interpretação</div><h2>{guide.title}</h2></div></div>
    <div className="measure-guide-grid">
      <div><b>O que acompanha</b><p>{guide.measure}</p></div>
      <div><b>Requisito</b><p>{guide.requirement}</p></div>
      <div><b>Resultado produzido</b><p>{guide.result}</p></div>
      <div><b>Limite de interpretação</b><p>{guide.limit}</p></div>
    </div>
  </section>
}
