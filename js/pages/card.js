import {requireUser,logout,$,nav,wireHeaderBadge} from './common.js';
$('logoutBtn').onclick=logout;$('nav').innerHTML=nav('cards');requireUser(async u=>{await wireHeaderBadge(u.id)});
