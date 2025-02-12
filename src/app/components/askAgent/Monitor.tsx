import { IAskAgentProps } from "@/app/utils/interface";

const Monitor = ({ agentProfile, setAgentProfile }: IAskAgentProps) => {

    console.log("agentProfile", agentProfile, setAgentProfile);
    
    return (
        <div>
            <h1>Monitor</h1>
        </div>
    )
}

export default Monitor;