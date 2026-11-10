import React, { useState } from "react";
import "./Createeditchannel.css";
import { useAppDispatch, useAppSelector } from "../../store";
import { refreshSessionThunk } from "../../store/slices/authSlice";
import { useUpdateChannel } from "../../query/hooks";

const Createeditchannel = ({
  seteditcreatechanelbtn,
}: {
  seteditcreatechanelbtn: (v: boolean) => void;
}) => {
  const dispatch = useAppDispatch();
  const currentuser = useAppSelector((s) => s.auth.session);
  const [name, setaname] = useState(currentuser?.result.name);
  const [desc, setdesc] = useState(currentuser?.result?.desc);
  const updateMutation = useUpdateChannel();

  // Phase 3b: after the channel edit, refresh the session from
  // GET /user/me instead of re-logging in. The old code re-logged in
  // with an email-only body 5 s later, which 401s since Phase 3a (an
  // email-only login needs a verified OTP). The refresh keeps the
  // existing token and swaps in the fresh user record.
  const handlesubmit = async () => {
    if (!name) {
      alert("Please enter name!!");
    } else if (!desc) {
      alert("Please enter Description");
    } else if (currentuser?.result._id) {
      await updateMutation.mutateAsync({
        id: currentuser.result._id,
        updatedata: { name: name, desc: desc },
      });
      seteditcreatechanelbtn(false);
      void dispatch(refreshSessionThunk());
    }
  };

  return (
    <div className="container_CreateEditChanel">
      <input
        type="submit"
        name="text"
        value={"X"}
        className="ibtn_x"
        onClick={() => seteditcreatechanelbtn(false)}
      />
      <div className="container2_CreateEditChanel">
        <h1>
          {currentuser?.result?.name ? <>Edit</> : <>Create</>} Your Channel
        </h1>
        <input
          type="text"
          placeholder="Enter Your/Chanel Name"
          name="text"
          value={name}
          onChange={(e) => setaname(e.target.value)}
          className="ibox"
        />
        <textarea
          rows={15}
          placeholder="Enter Chanel Description"
          className="ibox"
          value={desc}
          onChange={(e) => setdesc(e.target.value)}
          id=""
        ></textarea>
        <input
          type="submit"
          value={"submit"}
          onClick={handlesubmit}
          className="ibtn"
        />
      </div>
    </div>
  );
};

export default Createeditchannel;
