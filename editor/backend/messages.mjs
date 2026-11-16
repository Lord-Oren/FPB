// Display old system labels in English without rewriting saved content or messages.
const historyLabels={
  "Images pixel et liens de démonstration actualisés": "Website images and links updated",
  "Contenu publié": "Content published",
  "Contenu retiré": "Content taken off the site",
  "Contenu supprimé": "Content deleted",
  "Page mise à jour": "Page updated",
  "Version antérieure restaurée": "Earlier version restored",
  "ÉCHEC — site précédent conservé": "FAILED - previous site kept"
};
export const historyLabel=value=>historyLabels[value]??value;
export function conversationView(value){
 const result=structuredClone(value);
 for(const message of result.messages??[])if(message.simulation===true&&message.from==='us'){
  for(const prefix of ['[Simulation — aucun e-mail envoyé]\n','[Simulation - no email sent]\n'])if(message.text?.startsWith(prefix))message.text=message.text.slice(prefix.length);
 }
 return result;
}
