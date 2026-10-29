import {describe,it,expect,vi,beforeEach} from "vitest";
import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {ProjectImageAssets} from "./project-image-assets";
const mocks=vi.hoisted(()=>({request:vi.fn(),user:{id:"owner-a"} as {id:string}|null}));
vi.mock("@/hooks/use-auth",()=>({useAuth:()=>({user:mocks.user})}));
vi.mock("@/lib/queryClient",()=>({apiRequest:(...args:any[])=>mocks.request(...args)}));
function wrap(project:number|null=12){
  const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  return render(<QueryClientProvider client={client}><ProjectImageAssets conversationId={project}/></QueryClientProvider>);
}
beforeEach(()=>{
  mocks.user={id:"owner-a"};mocks.request.mockReset();
  mocks.request.mockImplementation(async(method:string,url:string)=>{
    if(url==="/api/media/jobs")return {json:async()=>({jobs:[{id:"11111111-1111-4111-8111-111111111111",kind:"image",status:"succeeded",prompt:"Gym image"},{id:"video",kind:"video",status:"succeeded",prompt:"Video"}]})};
    if(method==="POST")return {json:async()=>({asset:{id:"saved"}})};
    return {json:async()=>({assets:[]})};
  });
});
describe("project image controls",()=>{
  it("lists only the selected project's images after opening",async()=>{
    wrap();expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Project images"}));
    await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith("GET","/api/conversations/12/website-assets"));
    expect(screen.getByText(/Selected images are kept permanently/)).toBeTruthy();
  });
  it("offers stock lookup with explicit public-topic input and shows the saved result",async()=>{
    wrap();fireEvent.click(screen.getByRole("button",{name:"Project images"}));
    fireEvent.change(screen.getByLabelText("Image source"),{target:{value:"stock"}});
    fireEvent.change(screen.getByLabelText("Public photo subject"),{target:{value:"gym equipment"}});
    fireEvent.click(screen.getByRole("button",{name:"Find and save"}));
    await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith("POST","/api/conversations/12/website-assets",{query:"gym equipment",section:"hero"}));
    expect(await screen.findByText(/Saved permanently/)).toBeTruthy();
  });
  it("copies an existing completed image without submitting a new generation",async()=>{
    wrap();fireEvent.click(screen.getByRole("button",{name:"Project images"}));
    fireEvent.change(screen.getByLabelText("Image source"),{target:{value:"generated"}});
    await screen.findByRole("option",{name:"Gym image"});
    expect(screen.queryByRole("option",{name:"Video"})).toBeNull();
    fireEvent.change(screen.getByLabelText("Completed generated image"),{target:{value:"11111111-1111-4111-8111-111111111111"}});
    fireEvent.click(screen.getByRole("button",{name:"Keep on this website"}));
    await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith("POST","/api/conversations/12/website-assets",{mediaJobId:"11111111-1111-4111-8111-111111111111",section:"hero"}));
    expect(mocks.request.mock.calls.some(([method,url])=>method==="POST"&&url==="/api/media/jobs")).toBe(false);
  });
  it("hides controls and cached asset information when signed out",()=>{
    mocks.user=null;wrap();expect(screen.queryByText("Project images")).toBeNull();expect(mocks.request).not.toHaveBeenCalled();
  });
});
