import { LazyLoaderSettings, Loading } from "../lazy-loader";

class LazyLoader {
    private settings: LazyLoaderSettings;
    private io: IntersectionObserver;

    constructor(){
        this.settings = {
            cssDir: "css",
            jsDir: "js",
        };
        this.io = new IntersectionObserver(this.intersectionCallback);
    }

    public configure(settings:Partial<LazyLoaderSettings> = {}){
        this.settings = Object.assign(this.settings, settings);
        this.settings.cssDir = this.settings.cssDir.replace(/^\/|\/$/g, "").trim();
        this.settings.jsDir = this.settings.jsDir.replace(/^\/|\/$/g, "").trim()
        this.main();
    }

    public update():void{
        this.main();
    }

    public css(files:string|string[]):Promise<void>{
        return new Promise(async (resolve) => {
            if (!Array.isArray(files)){
                files = [files];
            }
            if (!files.length){
                resolve();
            }
            let resolved = 0;
            for (let i = 0; i < files.length; i++){
                const file = files[i];
                let href:string;
                if (file.indexOf("https://") === 0 || file.indexOf("http://") === 0){
                    href = file;
                } else if (file.indexOf("./") === 0 || file.indexOf("../") === 0 || file.indexOf("/") === 0){
                    href = file;
                } else {
                    href = `${location.origin}/${this.settings.cssDir}/${file.replace(/\.css$/g, "").trim()}.css`;
                }
                let stylesheet:HTMLLinkElement = document.head.querySelector(`link[href="${href}"]`);
                if (!stylesheet){
                    new Promise<void>(resolve => {
                        stylesheet = document.createElement("link");
                        stylesheet.href = href;
                        stylesheet.rel = "stylesheet";
                        stylesheet.onload = () => {
                            resolve();
                        }
                        stylesheet.onerror = () => {
                            resolve();
                        }
                        document.head.appendChild(stylesheet);
                    })
                    .then(() => {
                        resolved++;
                        if (resolved === files.length){
                            resolve();
                        }
                    });
                } else {
                    resolved++;
                    if (resolved === files.length){
                        resolve();
                    }
                }
            } 
        });
    }

    public async mount(tagName:string, constructor:CustomElementConstructor = null):Promise<void>{
        if (!customElements.get(tagName)){
            if (constructor === null){
                try{
                    const url = `${location.origin}/${this.settings.jsDir}/${tagName}.js`;
                    constructor = await this.loadModule(url);
                } catch (e) {
                    console.error(e);
                    throw e;
                }
            }
            customElements.define(tagName, constructor);
        }
        return;
    }
    
    private intersectionCallback: IntersectionObserverCallback = (entries: Array<IntersectionObserverEntry>) => {
        for (let i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
                const element = entries[i].target as HTMLElement;
                const tagName = element.tagName.toLowerCase().trim();
                if (!customElements.get(tagName)) {
                    this.upgrade(element);   
                }
                this.io.unobserve(element);
                element.setAttribute("web-component-state", "mounted");
            }
        }
    };


    private collectLazyCSS():string[]{
        let files:string[] = [];
        const elements = Array.from(document.body.querySelectorAll("[css]"));
        for (let i = 0; i < elements.length; i++){
            const attrValue = elements[i].getAttribute("css").trim().replace(/\s+/, " ");
            const fileNames = attrValue.split(" ");
            files = [...files, ...fileNames];
            elements[i].removeAttribute("css");
        }
        return Array.from(new Set(files));
    }

    private collectCustomElements():Array<HTMLElement>{
        let customElements:Array<HTMLElement> = [];
        const elements:Array<HTMLElement> = Array.from(document.body.querySelectorAll("[web-component]:not([web-component-state])"));
        for (let i = 0; i < elements.length; i++){
            elements[i].setAttribute("web-component-state", "tracked");
            customElements.push(elements[i]);
        }
        return customElements;
    }

    private async loadModule(url:string):Promise<CustomElementConstructor>{
        let module = await import(url);
        if (!module?.default){
            const key = Object.keys(module)?.[0] ?? null;
            if (!key){
                throw "ES Module is exporting an empty object.";
            }
            module = Object.assign({
                default: module[key],
            }, module);
        }
        return module.default;
    }

    private getModuleUrl(element:HTMLElement, tagName:string):string{
        let url = `${location.origin}/${this.settings.jsDir}/${tagName}.js`;
        const attrValue = element.getAttribute("web-component");
        if (attrValue !== ""){
            if (attrValue.indexOf("https://") === 0 || attrValue.indexOf("http://") === 0){
                url = attrValue;
            } else if (attrValue.indexOf("./") === 0 || attrValue.indexOf("../") === 0 || attrValue.indexOf("/") === 0){
                url = attrValue;
            } else {
                url = `${location.origin}/${this.settings.jsDir}/${attrValue.replace(/^\//g, "").trim()}`;
            }
        }
        return url;
    }

    private async upgrade(element:HTMLElement):Promise<void>{
        try{
            const tagName = element.tagName.toLowerCase().trim();
            const url = this.getModuleUrl(element, tagName);
            const constructor = await this.loadModule(url);
            this.mount(tagName, constructor);
        } catch (e) {
            console.error(e);
        }
    }

    private async upgradeOrTrack(elements:Array<HTMLElement>):Promise<void>{
        for (const element of elements) {
            const loadType = element.getAttribute("loading") as Loading;
            if (loadType === "eager") {
                await this.upgrade(element);
                element.setAttribute("web-component-state", "mounted");
            } else {
                this.io.observe(element);
            }
        }
    }

    private async main(){
        const files = this.collectLazyCSS();
        await this.css(files);
        const elements = this.collectCustomElements();
        this.upgradeOrTrack(elements);
    }
}

const loader = new LazyLoader();
const configure = loader.configure.bind(loader);
const update = loader.update.bind(loader);
const mount = loader.mount.bind(loader);
const css = loader.css.bind(loader);
export { configure, update, mount, css };