// Display old system labels in English without rewriting saved content or messages.
const historyLabels={
  "Images pixel et liens de démonstration actualisés": "Pixel images and sample links updated",
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
 for(const message of result.messages??[])if(message.simulation===true&&message.from==='us'&&message.text?.startsWith('[Simulation — aucun e-mail envoyé]\n'))message.text='[Simulation - no email sent]\n'+message.text.slice('[Simulation — aucun e-mail envoyé]\n'.length);
 return result;
}
