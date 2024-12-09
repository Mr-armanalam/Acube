import mongoose from "mongoose";

const userschema=mongoose.Schema({
    name:{type:String},
    email:{type:String,require:true},
    username:{type:String,require:true},
    picture:{type:String},
    desc:{type:String},
    reputation:{type:Number, default: 0},
    downloadsToday: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
    downloads: [{ title: String, date: Date }],
    lastReset: { type: Date, default: Date.now},
},{
    timestamps:true,
})

export default mongoose.model("User",userschema);



