package networkservlet;

import com.atlassian.bitbucket.commit.Commit;
import com.atlassian.bitbucket.commit.CommitEnricher;
import com.atlassian.bitbucket.io.SingleLineOutputHandler;
import com.atlassian.bitbucket.repository.Ref;
import com.atlassian.bitbucket.repository.Repository;
import com.atlassian.bitbucket.repository.RepositoryService;
import com.atlassian.bitbucket.repository.SimpleBranch;
import com.atlassian.bitbucket.repository.SimpleTag;
import com.atlassian.bitbucket.scm.CommitsCommandParameters;
import com.atlassian.bitbucket.scm.git.GitScm;
import com.atlassian.bitbucket.scm.git.command.GitCommand;
import com.atlassian.bitbucket.scm.git.command.GitScmCommandBuilder;
import com.atlassian.bitbucket.util.Page;
import com.atlassian.bitbucket.util.PageRequest;
import com.atlassian.bitbucket.util.PageRequestImpl;
import com.atlassian.bitbucket.util.PageUtils;
import com.atlassian.soy.renderer.SoyException;
import com.atlassian.soy.renderer.SoyTemplateRenderer;
import com.atlassian.webresource.api.assembler.PageBuilderService;
import com.google.common.collect.ImmutableMap;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;


public class NetworkServlet extends HttpServlet {
    
    static final String NETWORK_PAGE = "bitbucket.plugin.network";
    static final String NETWORK_PAGE_FRAGMENT = "bitbucket.plugin.network_fragment";
    private final RepositoryService repositoryService;
    private final CommitEnricher commitEnricher;
    private final GitScm gitScm;
    protected final SoyTemplateRenderer soyTemplateRenderer;
    private final PageBuilderService pageBuilderService;
    
    
    public NetworkServlet(RepositoryService repositoryService, CommitEnricher commitEnricher, GitScm gitScm, SoyTemplateRenderer soyTemplateRenderer, PageBuilderService pageBuilderService) {
        this.repositoryService = repositoryService;
        this.commitEnricher = commitEnricher;
        this.gitScm = gitScm;
        this.soyTemplateRenderer = soyTemplateRenderer;
        this.pageBuilderService = pageBuilderService;
    }
    
    
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String pathInfo = req.getPathInfo();
        String[] components = pathInfo.split("/");
        Boolean contentsOnly = Boolean.valueOf((req.getParameter("contentsOnly") != null));
        String pageStr = req.getParameter("page");
        Integer page = Integer.valueOf(Math.max(Integer.parseInt((pageStr == null) ? "0" : pageStr), 1) - 1);
        Integer limit = Integer.valueOf(50);
        Integer offset = Integer.valueOf(page.intValue() * limit.intValue());
    
        if (components.length < 3) {
            resp.sendError(404);
            return;
        } 
        
        Repository repository = this.repositoryService.getBySlug(components[1], components[2]);
        if (repository == null) {
            resp.sendError(404);
            return;
        } 
    
        Map<String, List<Ref>> labels = getLabels(repository);
        Page<Commit> commits = getCommits(repository, limit, offset);
    
        this.pageBuilderService.assembler().resources().requireWebResource("com.fgv.bitbucket.bitbucket-commit-graph:legacy-mode-resources");

        render(resp, contentsOnly.booleanValue() ? "bitbucket.plugin.network_fragment" : "bitbucket.plugin.network",
                ImmutableMap.of("repository", repository, "commitPage", commits, "labels", labels, "limit", limit, "page", Integer.valueOf(page.intValue() + 1)));
        
    }

    
    protected Map<String, List<Ref>> getLabels(Repository repository) throws IOException {
        Map<String, List<Ref>> labels = new HashMap<String, List<Ref>>();
        SingleLineOutputHandler sloh = new SingleLineOutputHandler();
        GitScmCommandBuilder showRef = (GitScmCommandBuilder)this.gitScm.getCommandBuilderFactory().builder(repository).command("show-ref");
        showRef.argumentAt(0, "--heads");
        showRef.argumentAt(1, "--tags");
        showRef.argumentAt(2, "--dereference");
        GitCommand<String> showRefCmd = showRef.build(sloh);
        String result = (String)showRefCmd.synchronous().call();
        if (result != null) {
            StringReader r = new StringReader(result);
            BufferedReader br = new BufferedReader(r);
      
            String line;
      
            while ((line = br.readLine()) != null) {
                if (line.length() > 40) {
                    String hash = line.substring(0, 40);
                    labels.put(hash, new ArrayList());
                } 
            } 

            r = new StringReader(result);
            br = new BufferedReader(r);
            while ((line = br.readLine()) != null) {
                if (line.length() > 40) {
                    SimpleBranch simpleBranch;
                    SimpleTag simpleTag;
                    String hash = line.substring(0, 40);
                    String id = line.substring(41).trim();
                    if (id.endsWith("^{}")) {
                        id = id.substring(0, id.length() - 3);
                    }
                    if (id.startsWith("refs/tags/")) {
                        String displayId = id.substring("refs/tags/".length());
                        simpleTag = ((SimpleTag.Builder)((SimpleTag.Builder)((SimpleTag.Builder)(new SimpleTag.Builder()).hash(hash).displayId(displayId)).id(id)).latestCommit(hash)).build();
                        ((List)labels.get(hash)).add(simpleTag);
                    } else {
                        String displayId = id.substring("refs/heads/".length());
                        simpleBranch = ((SimpleBranch.Builder)((SimpleBranch.Builder)((SimpleBranch.Builder)(new SimpleBranch.Builder()).displayId(displayId)).id(id)).latestCommit(hash)).build();
                        ((List)labels.get(hash)).add(simpleBranch);
                    }           
                } 
            } 
        } 
        return labels;
  }


  
    protected Page<Commit> getCommits(Repository repository, Integer limit, Integer offset) {
        PageRequestImpl pageRequestImpl = new PageRequestImpl(offset.intValue(), limit.intValue());
        PageRequest pageRequest = pageRequestImpl.buildRestrictedPageRequest(50);
        CommitsCommandParameters ccp = (new CommitsCommandParameters.Builder()).all(true).build();
        PagedCommitOutputHandler pcoh = new PagedCommitOutputHandler(repository, ccp, pageRequest);
        GitScmCommandBuilder revList = (GitScmCommandBuilder)this.gitScm.getCommandBuilderFactory().builder(repository).command("rev-list");
        revList.argumentAt(0, "--pretty=" + pcoh.getCommitReader().getFormat());
        revList.argumentAt(1, "--branches=*");
        revList.argumentAt(2, "--tags=*");
        revList.argumentAt(3, "--topo-order");
        GitCommand<Page<Commit>> revListCmd = revList.build(pcoh);
        Page<Commit> commits = (Page)revListCmd.synchronous().call();
        if (commits == null) {
            commits = PageUtils.createEmptyPage(pageRequest);
        } else {
            commits = this.commitEnricher.enrichPage(repository, commits, Collections.emptySet());
        } 
        return commits;
    }
  
    protected void render(HttpServletResponse resp, String templateName, Map<String, Object> data) throws IOException, ServletException {
        resp.setContentType("text/html;charset=UTF-8");
        try {
            this.soyTemplateRenderer.render(resp.getWriter(), "com.fgv.bitbucket.bitbucket-commit-graph:network-soy-templates", templateName, data);
        }
        catch (SoyException e) {
            Throwable cause = e.getCause();
            if (cause instanceof IOException) {
                throw (IOException)cause;
            }
            throw new ServletException(e);
        } 
    }
}