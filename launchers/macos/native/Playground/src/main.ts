import './style.css';
import { mountAdmin } from './admin';
import { mountPlayer } from './player';
if(location.pathname==='/player'||new URLSearchParams(location.search).get('view')==='player')mountPlayer();else mountAdmin();
