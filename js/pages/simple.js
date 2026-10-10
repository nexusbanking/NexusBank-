import {requireUser,logout,$,nav} from './common.js';$('logoutBtn').onclick=logout;$('nav').innerHTML=nav('home');requireUser(()=>{});
