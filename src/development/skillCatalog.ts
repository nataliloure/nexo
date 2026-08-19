import type {SkillDefinition,SkillId} from './developmentTypes'

export const SKILLS:SkillDefinition[]=[
  {id:'self.start_action',category:'Autorregulação',label:'Iniciar uma ação pequena',description:'Transformar intenção em um primeiro passo concreto e observável.'},
  {id:'self.stop_recursive_analysis',category:'Autorregulação',label:'Interromper análise sem informação nova',description:'Reconhecer quando continuar pensando não acrescenta dados ou decisão.'},
  {id:'emotion.deliberate_response',category:'Regulação emocional',label:'Escolher resposta deliberada',description:'Separar emoção, impulso e ação antes de responder.'},
  {id:'flexibility.uncertainty',category:'Flexibilidade',label:'Tolerar incerteza sem concluir cedo demais',description:'Manter hipóteses abertas quando a informação disponível ainda é limitada.'},
  {id:'communication.clarity',category:'Comunicação',label:'Comunicação clara',description:'Definir o ponto principal antes de ampliar explicações.'},
  {id:'communication.assertiveness',category:'Comunicação',label:'Assertividade',description:'Expressar pedido ou necessidade de forma específica e respeitosa.'},
  {id:'communication.listening',category:'Comunicação',label:'Escuta antes da resposta',description:'Buscar compreender antes de preparar a própria interpretação.'},
  {id:'communication.interpretation_checking',category:'Comunicação',label:'Checar interpretação',description:'Perguntar antes de assumir intenção ou significado não observados diretamente.'},
  {id:'metacognition.observation_inference',category:'Metacognição',label:'Observação × inferência',description:'Separar o que foi observado da conclusão construída a partir disso.'},
  {id:'metacognition.assumptions',category:'Metacognição',label:'Identificar pressupostos',description:'Tornar explícito o que precisa ser verdadeiro para uma conclusão se sustentar.'},
  {id:'critical.alternatives',category:'Pensamento crítico',label:'Considerar alternativas plausíveis',description:'Gerar explicações alternativas antes de fechar uma conclusão.'},
  {id:'relations.boundaries',category:'Relações',label:'Expressar limites',description:'Comunicar de forma clara o que é possível, desejado ou não disponível.'},
  {id:'values.small_action',category:'Valores',label:'Ação pequena orientada a valor',description:'Escolher um comportamento breve ligado a um valor previamente confirmado.'},
]

export const SKILL_BY_ID=Object.fromEntries(SKILLS.map(skill=>[skill.id,skill])) as Record<SkillId,SkillDefinition>

export const MANUAL_SKILL_OPTIONS:SkillId[]=[
  'communication.clarity',
  'emotion.deliberate_response',
  'self.start_action',
  'metacognition.observation_inference',
  'communication.interpretation_checking',
  'critical.alternatives',
]
