import { api } from "../api";
import { StudioStore } from "./studioStore";

const studioStore = new StudioStore(api);

export default studioStore;
