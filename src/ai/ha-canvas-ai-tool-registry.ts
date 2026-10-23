import {
    AbstractAiTool,
    type HaCanvasAiContext,
    type OpenAiToolSchema
} from "./abstract-ai-tool-base.js";
import {
    InspectCanvasStatusAiTool,
    InspectSceneGraphAiTool,
    InspectLayerDetailsAiTool,
    InspectAnimationTimelineAiTool,
    InspectPixelsAiTool,
    InspectSharedObjectsAndLibraryAiTool,
    CaptureCanvasSnapshotAiTool,
    CreateNewCanvasAiTool,
    SetCanvasPropertiesAiTool,
    CreateLayerAiTool,
    ModifyLayerAiTool,
    DrawVectorShapeAiTool,
    DrawBezierPathAiTool,
    DrawVectorTextAiTool,
    ModifyVectorObjectAiTool,
    DeformVectorObjectAiTool,
    BooleanPathOperationAiTool,
    SelectRegionAiTool,
    PaintRasterStrokeAiTool,
    RasterFillAiTool,
    ApplyGimpFilterAiTool,
    ConfigureGimpFilterPresetAiTool,
    CreateSharedObjectAiTool,
    ManageSharedObjectAiTool,
    SharedObjectLibraryAiTool,
    ConfigureTimelineAiTool,
    SetAnimationKeyframeAiTool,
    ConfigureAnimationCurveAiTool,
    ConfigureRasterKeyframeBlendAiTool,
    OpenOrImportFileAiTool,
    SaveAndExportArtworkAiTool,
    ManageDocumentMetadataAndFontsAiTool,
    UndoRedoAndTransformAiTool
} from "./tools/index.js";

/**
 * Built-in registry of all 29 AI tools provided directly by `HACanvas` (used by `HAEditor`, `AICore`,
 * and any downstream application embedding `hacanvas`).
 */
export class HaCanvasAiToolRegistry {
    private static readonly tools: AbstractAiTool[] = [
        new InspectCanvasStatusAiTool(),
        new InspectSceneGraphAiTool(),
        new InspectLayerDetailsAiTool(),
        new InspectAnimationTimelineAiTool(),
        new InspectPixelsAiTool(),
        new InspectSharedObjectsAndLibraryAiTool(),
        new CaptureCanvasSnapshotAiTool(),
        new CreateNewCanvasAiTool(),
        new SetCanvasPropertiesAiTool(),
        new CreateLayerAiTool(),
        new ModifyLayerAiTool(),
        new DrawVectorShapeAiTool(),
        new DrawBezierPathAiTool(),
        new DrawVectorTextAiTool(),
        new ModifyVectorObjectAiTool(),
        new DeformVectorObjectAiTool(),
        new BooleanPathOperationAiTool(),
        new SelectRegionAiTool(),
        new PaintRasterStrokeAiTool(),
        new RasterFillAiTool(),
        new ApplyGimpFilterAiTool(),
        new ConfigureGimpFilterPresetAiTool(),
        new CreateSharedObjectAiTool(),
        new ManageSharedObjectAiTool(),
        new SharedObjectLibraryAiTool(),
        new ConfigureTimelineAiTool(),
        new SetAnimationKeyframeAiTool(),
        new ConfigureAnimationCurveAiTool(),
        new ConfigureRasterKeyframeBlendAiTool(),
        new OpenOrImportFileAiTool(),
        new SaveAndExportArtworkAiTool(),
        new ManageDocumentMetadataAndFontsAiTool(),
        new UndoRedoAndTransformAiTool()
    ];

    public static getAllTools(): AbstractAiTool[] {
        return [...this.tools];
    }

    public static getTool(name: string): AbstractAiTool | undefined {
        return this.tools.find(t => t.name === name);
    }

    public static getOpenAiToolsSchema(): OpenAiToolSchema[] {
        return this.tools.map(t => t.toOpenAiSchema());
    }

    public static async executeTool(
        toolName: string,
        state: HaCanvasAiContext,
        args: Record<string, any> = {}
    ): Promise<any> {
        const tool = this.getTool(toolName);
        if (!tool) {
            throw new Error(`Unknown HACanvas AI tool: '${toolName}'`);
        }
        return await tool.execute(state, args);
    }

    public static getLiveToolStatusLabel(toolName: string, partialArgs: Record<string, any>, rawArgsStr: string): string {
        const tool = this.getTool(toolName);
        if (tool) {
            return `${tool.icon} ${tool.getLiveStatusLabel(partialArgs, rawArgsStr)}`;
        }
        return `🔧 Running ${toolName}...`;
    }

    public static getCompletedToolStatusLabel(toolName: string, args: Record<string, any>, result: any): string {
        const tool = this.getTool(toolName);
        if (tool) {
            return tool.getCompletedStatusLabel(args, result);
        }
        return `Executed ${toolName}`;
    }
}

/**
 * Alias for `HaCanvasAiToolRegistry` for full compatibility with `HAEditor`.
 */
export { HaCanvasAiToolRegistry as HaEditorAiToolRegistry };

