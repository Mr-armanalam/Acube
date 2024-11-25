import express from "express"
import { login, updatePoints } from "../Controllers/Auth.js"
import { updatechaneldata,getallchanels } from "../Controllers/channel.js";
import auth from "../middleware/auth.js";
const routes=express.Router();

routes.post('/login',login)
routes.patch('/update/:id',updatechaneldata)
routes.get('/getallchannel',getallchanels)
routes.post('/update-points',auth, updatePoints);

export default routes;