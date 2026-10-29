import {site} from './public-site-content.js';
import {structurePages,children,visibleNode,nodeHref} from './structure.js';
export const tree=site.structure;
export const pages=structurePages(tree);
export const zoneNodes=zone=>children(tree,null,zone).filter(n=>visibleNode(tree,n));
export const childNodes=id=>children(tree,id).filter(n=>visibleNode(tree,n));
export {nodeHref};
export const menuPages=group=>{const parent=tree.nodes.find(n=>n.title===group||n.id===group.toLowerCase());return parent?pages.filter(p=>p.node.parentId===parent.id&&!p.hidden):[];};
